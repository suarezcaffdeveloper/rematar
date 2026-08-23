"""Endpoint principal del Gateway WebSocket (Épica 3, Módulo 3.3) y despacho de
mensajes de sala (Módulo 3.4). Ver docs/20-gateway-websocket.md y
docs/21-sistema-de-salas.md.

Cero conocimiento de dominio: no importa nada de `app/modules/` salvo `auth` (para
resolver identidad, sin modificarlo) ni de `app/events/`. El bucle de vida de la
conexión entiende mensajes de gestión de conexión (`pong`) y de gestión de salas
(`join_room`, `leave_room`) — cualquier otro tipo se ignora silenciosamente, dejando el
lugar para que un módulo futuro (Event Bus) agregue su propio despacho sin
reestructurar este bucle (ver ADR-023 y ADR-024). Esta restricción se verifica en CI de
forma estática (`tests/test_architecture_boundaries.py::
test_gateway_websocket_never_imports_domain`): este archivo nunca debe importar
`app.modules.remates`/`app.modules.ofertas`.

Excepciones deliberadas (las únicas tres): (1) Épica 3, Módulo 3.6, ver
docs/23-snapshot-service.md y ADR-026 — tras un `join_room` exitoso, este archivo llama
a `SnapshotService.build`. (2) Épica 6, Módulo 6.2, ver docs/33-sistema-de-presencia.md
y ADR-036 — el join/leave de sala pasa por `PresenceService` (que internamente sigue
llamando a `RoomManager.join`/`leave`, sin cambios) en vez de a `RoomManager`
directamente, para que cada unión/salida real publique su evento de presencia. (3) Épica
7, Módulo 7.6, ver docs/42-moderacion-en-tiempo-real.md y ADR-045 — antes de delegar en
`PresenceService.join_room`, se chequea `ModerationService.is_banned` (un comprador
expulsado no puede reingresar mientras el remate siga activo). Ninguno de los tres
servicios sabe que existe un Gateway; acá solo se los invoca.

## Autorización de `join_room` (Fase 2 de remediación del WebSocket Security Audit)

Antes de esta fase, `RoomManager.join()` se llamaba (haciendo miembro de la sala a la
conexión, con su `room_joined` ya confirmado al cliente) **antes** de que
`SnapshotService.build` -- recién ahí -- comprobara si el remate era siquiera visible
para ese usuario. Un `NotFoundError` de esa comprobación tardía se traducía en un
`ErrorMessage(code=SNAPSHOT_UNAVAILABLE)`, pero la membresía en `RoomManager` ya
persistía: un comprador podía terminar indexado en la sala de un remate DRAFT ajeno
(o de un `remate_id` inexistente) sin que el sistema hubiera confirmado nunca que
tenía derecho a estar ahí.

Ahora `_handle_join_room` llama a `SnapshotService.assert_visible(remate_id, user)`
**antes** de `PresenceService.join_room` -- si lanza `NotFoundError` (remate
inexistente o no visible; no se distingue entre ambos casos a propósito, mismo criterio
anti-enumeración que ya sigue HTTP), se responde el mismo
`ErrorMessage(code=SNAPSHOT_UNAVAILABLE)` de siempre y la función retorna sin llamar
nunca a `RoomManager.join`.

`assert_visible` (`app/snapshot/service.py`) es un método nuevo y liviano de
`SnapshotService` -- reutiliza la misma `RemateService.get_visible_or_raise` que
`build` ya usa internamente, sin construir ningún snapshot. Se resolvió así, y no con
una dependencia de `RemateService` propia del Gateway, precisamente para no violar la
restricción de arriba: `SnapshotService` es, junto con `PresenceService`/
`ModerationService`, de los pocos paquetes "de negocio" que este archivo tiene permitido
conocer -- agregar una segunda dependencia (`RemateService`) solo para esto habría sido
la primera vez que `app/websocket/` importa `app.modules.remates` directamente,
exactamente lo que ese test de arquitectura existe para impedir.

`RoomManager` en sí (`app/websocket/rooms.py`) no cambia ni una línea -- sigue
"deliberadamente agnóstico del dominio" (ADR-024); la autorización se resuelve en esta
capa, antes de invocarlo, no dentro de él. `SnapshotService.build` conserva su propia
llamada a `get_visible_or_raise` sin cambios -- defensa en profundidad: el chequeo de
acá arriba evita que la conexión llegue a ser miembro de la sala, el de
`SnapshotService.build` evita que una futura regresión (una llamada a `_send_snapshot`
sin pasar por acá) filtre datos igual.

## Invalidación de conexiones (Fase 3 de remediación del WebSocket Security Audit)

La Fase 2 (arriba) controla "¿puede esta conexión entrar a esta sala?" en el momento de
`join_room`. Esta fase controla algo distinto: "¿sigue teniendo derecho esta conexión
YA ABIERTA a seguir conectada?" -- un problema que `join_room` no puede resolver,
porque una sesión puede volverse inválida (logout, cambio de contraseña, suspensión)
en cualquier momento *después* de que la conexión ya se autenticó.

`authenticate_connection` (`app/websocket/auth.py`) ahora usa
`AuthService.get_current_session_from_access_token`, que además de validar el usuario
resuelve el `session_id` de la conexión (claim `sid` del access token) y comprueba que
esa sesión no esté ya revocada al momento de conectar. De ahí en más, mientras la
conexión sigue abierta, este archivo no vuelve a consultar nada: la invalidación de una
sesión ya abierta se entera por un cierre **activo** desde afuera
(`ConnectionManager.close_connections`, disparado por
`app/modules/auth/realtime.py::SessionInvalidationDispatcher` al reaccionar al evento
`SessionInvalidated` -- ver ese módulo para el detalle completo de qué eventos lo
disparan y cómo se propaga entre instancias vía Redis Pub/Sub). Cerrar el socket desde
afuera dispara el mismo `WebSocketDisconnect`/`finally` que ya maneja cualquier
desconexión -- este archivo no necesitó ningún cambio adicional para el cleanup.

## Rate limiting y protección DoS (Fase 4 de remediación del WebSocket Security Audit)

Ver `app/websocket/rate_limit.py` para el detalle completo (scopes, límites, qué pasa si
Redis está caído). Acá solo un resumen de dónde se enganchó cada control, todos
CLIENTE -> SERVIDOR (nunca sobre lo que manda `EventDispatcher`, que sigue sin tocarse):

1. Conexiones nuevas por IP (`ip_connect_key`) -- justo después de `websocket.accept()`,
   antes de `authenticate_connection`: es la única identidad disponible antes de
   autenticar.
2. Tamaño máximo de mensaje (`WS_MAX_MESSAGE_BYTES`) -- dentro de `authenticate_connection`
   (`app/websocket/auth.py`) para el primer mensaje, y al principio de `_handle_message`
   para los siguientes.
3. Conexiones simultáneas por usuario (`user_connection_limit_exceeded`) -- justo antes de
   `manager.register`, una vez resuelta la identidad.
4. Mensajes por conexión, cualquier tipo (`connection_message_key`) -- al principio de
   `_handle_message`, antes de intentar parsear el JSON.
5. Acciones de sala por usuario (`user_room_action_key`) -- al principio de
   `_handle_join_room`/`_handle_leave_room`, antes de la autorización de dominio (que
   sigue siendo obligatoria e independiente -- rate limiting no la reemplaza).
"""

import asyncio
import uuid
from datetime import UTC, datetime
from typing import Annotated

import structlog
from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from pydantic import ValidationError

from app.core.config import Settings, get_settings
from app.core.exceptions import NotFoundError
from app.moderation.dependencies import get_moderation_service
from app.moderation.schemas import ERROR_BANNED_FROM_ROOM
from app.moderation.service import ModerationService
from app.modules.auth.dependencies import get_auth_service
from app.modules.auth.service import AuthService
from app.modules.users.models import User
from app.presence.dependencies import get_presence_service
from app.presence.service import PresenceService
from app.snapshot.dependencies import get_snapshot_service
from app.snapshot.messages import SNAPSHOT_UNAVAILABLE, SnapshotMessage
from app.snapshot.service import SnapshotService
from app.websocket import close_codes
from app.websocket.auth import authenticate_connection
from app.websocket.dependencies import get_connection_manager
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
from app.websocket.rate_limit import (
    WSRateLimiter,
    connection_message_key,
    get_ws_rate_limiter,
    ip_connect_key,
    user_connection_limit_exceeded,
    user_room_action_key,
)
from app.websocket.rooms import (
    ERROR_ALREADY_IN_ROOM,
    ERROR_INVALID_ROOM_ID,
    ERROR_NOT_IN_ROOM,
    ERROR_RATE_LIMITED,
)
from app.websocket.utils import safe_close

logger = structlog.get_logger(__name__)

router = APIRouter()


@router.websocket("/ws")
async def websocket_gateway(
    websocket: WebSocket,
    auth_service: Annotated[AuthService, Depends(get_auth_service)],
    manager: Annotated[ConnectionManager, Depends(get_connection_manager)],
    presence_service: Annotated[PresenceService, Depends(get_presence_service)],
    snapshot_service: Annotated[SnapshotService, Depends(get_snapshot_service)],
    moderation_service: Annotated[ModerationService, Depends(get_moderation_service)],
    rate_limiter: Annotated[WSRateLimiter, Depends(get_ws_rate_limiter)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> None:
    await websocket.accept()

    # Fase 4 de remediación del WebSocket Security Audit -- única identidad disponible
    # antes de autenticar (ver docstring del módulo). `websocket.client` puede ser `None`
    # bajo algunos transportes de test que no completan el scope ASGI -- se trata como
    # una IP más (todas comparten el mismo balde), nunca como excepción que deje pasar.
    client_ip = websocket.client.host if websocket.client is not None else "unknown"
    connection_allowed = await rate_limiter.allow(
        ip_connect_key(client_ip),
        limit=settings.WS_IP_CONNECT_RATE_LIMIT_MAX,
        window_seconds=settings.WS_IP_CONNECT_RATE_LIMIT_WINDOW_SECONDS,
        scope="connect_ip",
    )
    if not connection_allowed:
        logger.warning("ws_ip_connect_rate_limited", client_ip=client_ip)
        await safe_close(
            websocket,
            code=close_codes.RATE_LIMITED,
            reason="Demasiadas conexiones nuevas desde esta red. Esperá un momento.",
        )
        return

    auth_result = await authenticate_connection(
        websocket,
        auth_service,
        timeout_seconds=settings.WS_AUTH_TIMEOUT_SECONDS,
        max_message_bytes=settings.WS_MAX_MESSAGE_BYTES,
    )
    if auth_result is None:
        return  # ya se cerró la conexión con el código correspondiente (ver auth.py)
    user, session_id = auth_result

    # ADR-049 (visitante anónimo): `user` es `None` para una conexión sin token. El
    # resto de este archivo sigue necesitando ALGÚN id de conexión (registro en
    # `ConnectionManager`, sala, presencia, rate limiting) -- se genera uno sintético,
    # nunca ligado a ninguna fila de `users`, exactamente para esta conexión puntual. La
    # autorización de negocio real (`assert_visible`/`build`, más abajo) sigue usando
    # `user` tal cual (`None` incluido), nunca este id sintético.
    connection_user_id = user.id if user is not None else uuid.uuid4()

    # Fase 4: límite de conexiones simultáneas por usuario -- se rechaza la conexión
    # NUEVA, sin tocar las ya existentes (ver docstring de `user_connection_limit_exceeded`
    # para por qué no hace falta un lock acá: ningún `await` entre este chequeo y
    # `manager.register` más abajo). Para un anónimo, `connection_user_id` es distinto en
    # cada conexión -- este gauge en particular no lo alcanza (ver ADR-049, "riesgos
    # conocidos"); el límite por IP de conexiones nuevas (arriba) sigue aplicando igual.
    if user_connection_limit_exceeded(
        manager, connection_user_id, max_connections=settings.WS_MAX_CONNECTIONS_PER_USER
    ):
        logger.warning("ws_user_connection_limit_exceeded", user_id=str(connection_user_id))
        await safe_close(
            websocket,
            code=close_codes.RATE_LIMITED,
            reason="Alcanzaste el máximo de conexiones simultáneas para tu cuenta.",
        )
        return

    context = ConnectionContext(
        connection_id=uuid.uuid4(),
        user_id=connection_user_id,
        session_id=session_id,
        websocket=websocket,
    )
    await manager.register(context)
    try:
        await websocket.send_text(
            ConnectedMessage(
                connection_id=context.connection_id, user_id=connection_user_id
            ).model_dump_json()
        )
        await _run_connection_loop(
            websocket,
            context,
            settings,
            presence_service,
            snapshot_service,
            moderation_service,
            rate_limiter,
            user,
        )
    except WebSocketDisconnect:
        pass
    except Exception:
        logger.exception("ws_gateway_unexpected_error", connection_id=str(context.connection_id))
        await safe_close(websocket, code=close_codes.INTERNAL_ERROR, reason="Error interno.")
    finally:
        await presence_service.leave_room(context.connection_id, context.user_id)
        await manager.unregister(context.connection_id)


async def _run_connection_loop(
    websocket: WebSocket,
    context: ConnectionContext,
    settings: Settings,
    presence_service: PresenceService,
    snapshot_service: SnapshotService,
    moderation_service: ModerationService,
    rate_limiter: WSRateLimiter,
    user: User | None,
) -> None:
    """Alterna entre esperar un mensaje del cliente y, si no llega nada dentro del
    intervalo de heartbeat, enviar un `ping`. Si no hay `pong` dentro del timeout
    correspondiente, cierra la conexión — no espera a que el sistema operativo detecte
    un socket muerto.

    Fase 3 de remediación del WebSocket Security Audit: además de esperar el próximo
    mensaje, cada vuelta corre en carrera contra `context.invalidated` (un
    `asyncio.Event`, ver `app/websocket/manager.py::ConnectionManager.close_connections`)
    -- si una sesión se invalida mientras esta conexión está bloqueada esperando un
    mensaje (el caso normal: la mayor parte del tiempo no hay nada que leer), la señal
    la despierta de inmediato en vez de recién en el próximo `ping` de heartbeat."""
    while True:
        receive_future = asyncio.ensure_future(websocket.receive_text())
        invalidated_future = asyncio.ensure_future(context.invalidated.wait())
        done, pending = await asyncio.wait(
            {receive_future, invalidated_future},
            timeout=settings.WS_PING_INTERVAL_SECONDS,
            return_when=asyncio.FIRST_COMPLETED,
        )
        for pending_future in pending:
            pending_future.cancel()
            try:
                await pending_future
            except asyncio.CancelledError:
                pass

        if invalidated_future in done:
            await safe_close(
                websocket,
                code=context.invalidation_code or close_codes.UNAUTHORIZED,
                reason=context.invalidation_reason or "Tu sesión ya no es válida.",
            )
            return

        if receive_future not in done:
            # Ninguna de las dos futures terminó a tiempo -- timeout de heartbeat.
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

        raw_message = receive_future.result()

        should_stop = await _handle_message(
            raw_message,
            context,
            websocket,
            presence_service,
            snapshot_service,
            moderation_service,
            rate_limiter,
            settings,
            user,
        )
        if should_stop:
            return


async def _handle_message(
    raw_message: str,
    context: ConnectionContext,
    websocket: WebSocket,
    presence_service: PresenceService,
    snapshot_service: SnapshotService,
    moderation_service: ModerationService,
    rate_limiter: WSRateLimiter,
    settings: Settings,
    user: User | None,
) -> bool:
    """Despacha por `type`: `pong` (heartbeat), `join_room`/`leave_room` (salas,
    Módulo 3.4). Cualquier otro tipo (incluido cualquier protocolo futuro, por ejemplo
    del Event Bus) se ignora silenciosamente — no es un error del cliente, es
    simplemente algo que este módulo todavía no interpreta.

    Fase 4 de remediación del WebSocket Security Audit: antes de intentar parsear nada,
    se rechaza un mensaje demasiado grande y se aplica el límite general de mensajes por
    conexión (ver `app/websocket/rate_limit.py`) -- a propósito, cubre por igual mensajes
    válidos, inválidos y de tipo desconocido, sin necesitar un mecanismo separado para
    "abuso de mensajes inválidos" (sección 10 del audit). Devuelve `True` si la conexión
    ya se cerró (el llamador, `_run_connection_loop`, debe dejar de leer)."""
    if len(raw_message.encode("utf-8")) > settings.WS_MAX_MESSAGE_BYTES:
        logger.warning(
            "ws_message_too_large",
            connection_id=str(context.connection_id),
            user_id=str(context.user_id),
        )
        await safe_close(
            websocket, code=close_codes.MESSAGE_TOO_LARGE, reason="Mensaje demasiado grande."
        )
        return True

    messages_allowed = await rate_limiter.allow(
        connection_message_key(context.connection_id),
        limit=settings.WS_MESSAGE_RATE_LIMIT_MAX,
        window_seconds=settings.WS_MESSAGE_RATE_LIMIT_WINDOW_SECONDS,
        scope="connection_message",
    )
    if not messages_allowed:
        logger.warning(
            "ws_message_rate_limited",
            connection_id=str(context.connection_id),
            user_id=str(context.user_id),
        )
        await safe_close(
            websocket,
            code=close_codes.RATE_LIMITED,
            reason="Demasiados mensajes en poco tiempo.",
        )
        return True

    try:
        message = WSMessage.model_validate_json(raw_message)
    except ValidationError:
        return False

    if message.type == "pong":
        context.last_pong_at = datetime.now(UTC)
    elif message.type == "join_room":
        await _handle_join_room(
            raw_message,
            context,
            websocket,
            presence_service,
            snapshot_service,
            moderation_service,
            rate_limiter,
            settings,
            user,
        )
    elif message.type == "leave_room":
        await _handle_leave_room(context, websocket, presence_service, rate_limiter, settings)
    return False


async def _handle_join_room(
    raw_message: str,
    context: ConnectionContext,
    websocket: WebSocket,
    presence_service: PresenceService,
    snapshot_service: SnapshotService,
    moderation_service: ModerationService,
    rate_limiter: WSRateLimiter,
    settings: Settings,
    user: User | None,
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

    # Fase 4 de remediación del WebSocket Security Audit -- orden pedido por el audit:
    # "mensaje recibido -> validación básica -> rate limit -> autorización -> operación".
    # Rate limiting NO reemplaza la autorización de la Fase 2 (`assert_visible`/
    # `is_banned` más abajo, sin cambios) -- solo corre antes, para no pagar el costo de
    # Postgres/Redis de esos chequeos si el usuario ya está abusando de join/leave.
    if not await _room_action_allowed(rate_limiter, settings, context.user_id):
        await websocket.send_text(
            ErrorMessage(
                code=ERROR_RATE_LIMITED,
                message="Estás uniéndote/saliendo de salas demasiado rápido. Esperá unos segundos.",
            ).model_dump_json()
        )
        return

    # `context.user_id` (no `user.id`): para un visitante anónimo es un id sintético que
    # nunca va a coincidir con ninguna fila de moderación -- esto es, a propósito, lo que
    # hace que la moderación de invitados quede fuera de alcance por ahora (ADR-049): ni
    # bypassea nada (la consulta corre igual) ni requiere una rama especial acá.
    if await moderation_service.is_banned(join_message.remate_id, context.user_id):
        await websocket.send_text(
            ErrorMessage(
                code=ERROR_BANNED_FROM_ROOM,
                message="Fuiste expulsado de este remate y no podés volver a ingresar.",
            ).model_dump_json()
        )
        return

    # Fase 2 de remediación del WebSocket Security Audit: autorización ANTES de que la
    # conexión se convierta en miembro de la sala -- misma política de visibilidad que
    # ya aplican SnapshotService/ChatService/AuctionEngine por HTTP
    # (RemateService.get_visible_or_raise, reutilizada acá vía
    # SnapshotService.assert_visible -- ver docstring del módulo para el porqué),
    # nunca una regla nueva. `NotFoundError` cubre tanto "no existe" como "existe pero
    # no es visible para este usuario" -- no se distingue a propósito (mismo criterio
    # anti-enumeración que ya sigue HTTP), y se reutiliza el mismo código de error que
    # ya usaba una falla tardía del snapshot (`_send_snapshot` más abajo), no uno nuevo.
    try:
        await snapshot_service.assert_visible(join_message.remate_id, user)
    except NotFoundError:
        await websocket.send_text(
            ErrorMessage(
                code=SNAPSHOT_UNAVAILABLE,
                message="No se pudo obtener el estado del remate.",
            ).model_dump_json()
        )
        return

    joined = await presence_service.join_room(
        join_message.remate_id, context.connection_id, context.user_id
    )
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
    await _send_snapshot(
        websocket, snapshot_service, join_message.remate_id, user, presence_service
    )


async def _send_snapshot(
    websocket: WebSocket,
    snapshot_service: SnapshotService,
    remate_id: uuid.UUID,
    user: User | None,
    presence_service: PresenceService,
) -> None:
    """Se manda una única vez, justo después de confirmar el `join_room` (Épica 3,
    Módulo 3.6) -- de ahí en más la conexión se entera de cambios exclusivamente por los
    eventos que reenvía el Event Consumer (Módulo 3.5, sin modificar). Un fallo acá
    (remate no encontrado/no visible, o cualquier error inesperado) se informa con un
    `ErrorMessage` sin cerrar la conexión ni deshacer el `join_room` ya confirmado — el
    cliente sigue en la sala y puede reintentar."""
    try:
        connected_users_detail = presence_service.connected_users_summary(remate_id)
        snapshot = await snapshot_service.build(
            remate_id,
            user,
            connected_users=len(connected_users_detail),
            connected_users_detail=connected_users_detail,
        )
    except NotFoundError:
        await websocket.send_text(
            ErrorMessage(
                code=SNAPSHOT_UNAVAILABLE,
                message="No se pudo obtener el estado del remate.",
            ).model_dump_json()
        )
        return
    except Exception:
        logger.exception("snapshot_build_failed", remate_id=str(remate_id))
        await websocket.send_text(
            ErrorMessage(
                code=SNAPSHOT_UNAVAILABLE,
                message="No se pudo obtener el estado del remate.",
            ).model_dump_json()
        )
        return

    await websocket.send_text(SnapshotMessage(data=snapshot).model_dump_json())


async def _room_action_allowed(
    rate_limiter: WSRateLimiter, settings: Settings, user_id: uuid.UUID
) -> bool:
    """Compartido por `_handle_join_room`/`_handle_leave_room` -- un único balde por
    usuario para ambas acciones (Fase 4 del audit, sección 8: "no agregues protección
    innecesaria si el análisis demuestra que no aporta seguridad significativa" --
    `leave_room` toca el mismo `RoomManager`/`PresenceService` que `join_room`, así que
    un balde separado no protegería nada distinto, solo duplicaría el mecanismo)."""
    return await rate_limiter.allow(
        user_room_action_key(user_id),
        limit=settings.WS_ROOM_ACTION_RATE_LIMIT_MAX,
        window_seconds=settings.WS_ROOM_ACTION_RATE_LIMIT_WINDOW_SECONDS,
        scope="room_action",
    )


async def _handle_leave_room(
    context: ConnectionContext,
    websocket: WebSocket,
    presence_service: PresenceService,
    rate_limiter: WSRateLimiter,
    settings: Settings,
) -> None:
    if not await _room_action_allowed(rate_limiter, settings, context.user_id):
        await websocket.send_text(
            ErrorMessage(
                code=ERROR_RATE_LIMITED,
                message="Estás uniéndote/saliendo de salas demasiado rápido. Esperá unos segundos.",
            ).model_dump_json()
        )
        return

    remate_id = await presence_service.leave_room(context.connection_id, context.user_id)
    if remate_id is None:
        await websocket.send_text(
            ErrorMessage(
                code=ERROR_NOT_IN_ROOM, message="No estás en ninguna sala."
            ).model_dump_json()
        )
        return

    await websocket.send_text(RoomLeftMessage(remate_id=remate_id).model_dump_json())
