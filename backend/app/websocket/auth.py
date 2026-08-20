"""Autenticación de conexión (Épica 3, Módulo 3.3) — implementa por primera vez el
flujo que ADR-006 (Fase 0) ya había decidido: sin credenciales en la URL, autenticación
en el primer mensaje. Ver docs/20-gateway-websocket.md.

Reutiliza `AuthService.get_current_session_from_access_token` (Fase 3 de remediación
del WebSocket Security Audit -- antes, `get_current_user_from_access_token`, todavía la
que usa HTTP sin cambios) — el Gateway sigue siendo un segundo transporte para la misma
identidad ya validada por HTTP (`app/modules/auth/dependencies.py`, `get_current_user`),
no un esquema de autenticación paralelo; la única diferencia es que acá también hace
falta el `session_id` de esa identidad (para poder cerrar más adelante solo esta
conexión si esta sesión puntual se invalida, ver `app/websocket/manager.py`), y el
método usado ya valida, además, que la sesión no esté revocada -- lo que hace que
reconectar con un access token todavía no vencido pero cuya sesión ya fue cerrada
(logout/cambio de contraseña/suspensión) sea rechazado acá mismo, en el handshake.
"""

import asyncio
import uuid

import structlog
from fastapi import WebSocket, WebSocketDisconnect
from pydantic import ValidationError

from app.core.exceptions import UnauthorizedError
from app.modules.auth.service import AuthService
from app.modules.users.models import User
from app.websocket import close_codes
from app.websocket.messages import AuthMessage
from app.websocket.utils import safe_close

logger = structlog.get_logger(__name__)


async def authenticate_connection(
    websocket: WebSocket,
    auth_service: AuthService,
    *,
    timeout_seconds: float,
    max_message_bytes: int,
) -> tuple[User, uuid.UUID | None] | None:
    """Espera el primer mensaje con un timeout, lo valida como `AuthMessage`, y
    resuelve el usuario (+ `session_id`, Fase 3). Devuelve `None` (habiendo cerrado la
    conexión con el código correspondiente) si cualquier paso falla — nunca lanza.

    Fase 4 de remediación del WebSocket Security Audit: `max_message_bytes` protege este
    primer mensaje igual que `_handle_message` protege los siguientes (ver
    `app/websocket/router.py`) -- sin este chequeo, un cliente sin autenticar todavía
    podría forzar al servidor a intentar parsear un payload arbitrariamente grande antes
    de haber demostrado ninguna identidad."""
    try:
        raw_message = await asyncio.wait_for(websocket.receive_text(), timeout=timeout_seconds)
    except TimeoutError:
        await safe_close(
            websocket, code=close_codes.AUTH_TIMEOUT, reason="Tiempo de autenticación agotado."
        )
        return None
    except WebSocketDisconnect:
        # El cliente ya se fue: no hay nada que cerrar ni loguear como fallo de auth.
        return None

    if len(raw_message.encode("utf-8")) > max_message_bytes:
        await safe_close(
            websocket, code=close_codes.MESSAGE_TOO_LARGE, reason="Mensaje demasiado grande."
        )
        return None

    try:
        message = AuthMessage.model_validate_json(raw_message)
    except ValidationError:
        await safe_close(
            websocket,
            code=close_codes.INVALID_MESSAGE,
            reason="Se esperaba {'type': 'auth', 'token': '...'} como primer mensaje.",
        )
        return None

    try:
        user, session_id = await auth_service.get_current_session_from_access_token(
            message.token
        )
    except UnauthorizedError as exc:
        await safe_close(websocket, code=close_codes.UNAUTHORIZED, reason=exc.message)
        return None

    logger.info(
        "ws_authenticated",
        user_id=str(user.id),
        session_id=str(session_id) if session_id else None,
    )
    return user, session_id
