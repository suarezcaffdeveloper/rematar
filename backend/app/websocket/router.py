"""Endpoint principal del Gateway WebSocket (Épica 3, Módulo 3.3) y despacho de
mensajes de sala (Módulo 3.4). Ver docs/20-gateway-websocket.md y
docs/21-sistema-de-salas.md.

Cero conocimiento de dominio: no importa nada de `app/modules/` salvo `auth` (para
resolver identidad, sin modificarlo) ni de `app/events/`. El bucle de vida de la
conexión entiende mensajes de gestión de conexión (`pong`) y de gestión de salas
(`join_room`, `leave_room`) — cualquier otro tipo se ignora silenciosamente, dejando el
lugar para que un módulo futuro (Event Bus) agregue su propio despacho sin
reestructurar este bucle (ver ADR-023 y ADR-024).
"""

import asyncio
import uuid
from datetime import UTC, datetime
from typing import Annotated

import structlog
from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from pydantic import ValidationError

from app.core.config import Settings, get_settings
from app.modules.auth.dependencies import get_auth_service
from app.modules.auth.service import AuthService
from app.websocket import close_codes
from app.websocket.auth import authenticate_connection
from app.websocket.dependencies import get_connection_manager, get_room_manager
from app.websocket.manager import ConnectionContext, ConnectionManager
from app.websocket.messages import (
    ConnectedMessage,
    ErrorMessage,
    JoinRoomMessage,
    PingMessage,
    RoomJoinedMessage,
    RoomLeftMessage,
    WSMessage,
)
from app.websocket.rooms import (
    ERROR_ALREADY_IN_ROOM,
    ERROR_INVALID_ROOM_ID,
    ERROR_NOT_IN_ROOM,
    RoomManager,
)
from app.websocket.utils import safe_close

logger = structlog.get_logger(__name__)

router = APIRouter()


@router.websocket("/ws")
async def websocket_gateway(
    websocket: WebSocket,
    auth_service: Annotated[AuthService, Depends(get_auth_service)],
    manager: Annotated[ConnectionManager, Depends(get_connection_manager)],
    room_manager: Annotated[RoomManager, Depends(get_room_manager)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> None:
    await websocket.accept()

    user = await authenticate_connection(
        websocket, auth_service, timeout_seconds=settings.WS_AUTH_TIMEOUT_SECONDS
    )
    if user is None:
        return  # ya se cerró la conexión con el código correspondiente (ver auth.py)

    context = ConnectionContext(connection_id=uuid.uuid4(), user_id=user.id, websocket=websocket)
    await manager.register(context)
    try:
        await websocket.send_text(
            ConnectedMessage(connection_id=context.connection_id, user_id=user.id).model_dump_json()
        )
        await _run_connection_loop(websocket, context, settings, room_manager)
    except WebSocketDisconnect:
        pass
    except Exception:
        logger.exception("ws_gateway_unexpected_error", connection_id=str(context.connection_id))
        await safe_close(websocket, code=close_codes.INTERNAL_ERROR, reason="Error interno.")
    finally:
        await room_manager.leave(context.connection_id)
        await manager.unregister(context.connection_id)


async def _run_connection_loop(
    websocket: WebSocket,
    context: ConnectionContext,
    settings: Settings,
    room_manager: RoomManager,
) -> None:
    """Alterna entre esperar un mensaje del cliente y, si no llega nada dentro del
    intervalo de heartbeat, enviar un `ping`. Si no hay `pong` dentro del timeout
    correspondiente, cierra la conexión — no espera a que el sistema operativo detecte
    un socket muerto."""
    while True:
        try:
            raw_message = await asyncio.wait_for(
                websocket.receive_text(), timeout=settings.WS_PING_INTERVAL_SECONDS
            )
        except TimeoutError:
            elapsed = (datetime.now(UTC) - context.last_pong_at).total_seconds()
            if elapsed > settings.WS_PONG_TIMEOUT_SECONDS:
                await safe_close(
                    websocket,
                    code=close_codes.HEARTBEAT_TIMEOUT,
                    reason="Sin respuesta al heartbeat.",
                )
                return
            await websocket.send_text(PingMessage().model_dump_json())
            continue

        await _handle_message(raw_message, context, websocket, room_manager)


async def _handle_message(
    raw_message: str,
    context: ConnectionContext,
    websocket: WebSocket,
    room_manager: RoomManager,
) -> None:
    """Despacha por `type`: `pong` (heartbeat), `join_room`/`leave_room` (salas,
    Módulo 3.4). Cualquier otro tipo (incluido cualquier protocolo futuro, por ejemplo
    del Event Bus) se ignora silenciosamente — no es un error del cliente, es
    simplemente algo que este módulo todavía no interpreta."""
    try:
        message = WSMessage.model_validate_json(raw_message)
    except ValidationError:
        return

    if message.type == "pong":
        context.last_pong_at = datetime.now(UTC)
    elif message.type == "join_room":
        await _handle_join_room(raw_message, context, websocket, room_manager)
    elif message.type == "leave_room":
        await _handle_leave_room(context, websocket, room_manager)


async def _handle_join_room(
    raw_message: str,
    context: ConnectionContext,
    websocket: WebSocket,
    room_manager: RoomManager,
) -> None:
    try:
        join_message = JoinRoomMessage.model_validate_json(raw_message)
    except ValidationError:
        await websocket.send_text(
            ErrorMessage(
                code=ERROR_INVALID_ROOM_ID, message="'remate_id' debe ser un UUID válido."
            ).model_dump_json()
        )
        return

    joined = await room_manager.join(join_message.remate_id, context.connection_id)
    if not joined:
        await websocket.send_text(
            ErrorMessage(
                code=ERROR_ALREADY_IN_ROOM,
                message="Ya estás en otra sala — salí de esa antes de unirte a una nueva.",
            ).model_dump_json()
        )
        return

    await websocket.send_text(
        RoomJoinedMessage(remate_id=join_message.remate_id).model_dump_json()
    )


async def _handle_leave_room(
    context: ConnectionContext, websocket: WebSocket, room_manager: RoomManager
) -> None:
    remate_id = await room_manager.leave(context.connection_id)
    if remate_id is None:
        await websocket.send_text(
            ErrorMessage(
                code=ERROR_NOT_IN_ROOM, message="No estás en ninguna sala."
            ).model_dump_json()
        )
        return

    await websocket.send_text(RoomLeftMessage(remate_id=remate_id).model_dump_json())
