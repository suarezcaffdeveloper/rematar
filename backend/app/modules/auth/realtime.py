"""`SessionInvalidationDispatcher` -- marca para cierre las conexiones WebSocket
correspondientes a una sesión (o a todas las de un usuario) invalidada (Fase 3 de
remediación del WebSocket Security Audit).

Mismo patrón estructural que `ModerationEventDispatcher` (`app/moderation/realtime.py`)/
`ChatSystemEventDispatcher` (`app/modules/chat/realtime.py`): una instancia más de
`EventConsumer` (`app/main.py`), suscripta a un canal propio
(`SESSION_INVALIDATED_TOPIC`, un único canal fijo -- no el patrón `events.*` de los
eventos scoped a un remate, este evento no lo está, ver
`app/modules/auth/events.py::SessionInvalidated`), que lee el JSON crudo sin importar
la clase de evento -- mismo criterio "el dominio publica, no sabe quién consume" que ya
sigue todo el proyecto.

A diferencia de `EventDispatcher` (que reenvía datos AL cliente dentro de una sala),
este dispatcher nunca entrega nada en el cuerpo de un mensaje: marca la conexión para
cierre vía `ConnectionManager.close_connections` (que no cierra el socket él mismo --
ver su docstring en `app/websocket/manager.py` -- solo señala una `asyncio.Event` que
la propia conexión nota y actúa). El cliente se entera exclusivamente por el cierre del
socket (código + razón genérica del protocolo WS, nunca el `reason` interno de este
evento) -- evita filtrarle al propio cliente afectado el motivo exacto (logout/
password_changed/user_suspended) más allá de lo que un cierre "no autorizado" ya
comunica por sí solo (mismo criterio anti-filtración que ya sigue `SNAPSHOT_UNAVAILABLE`
en la Fase 2: la razón detallada queda en el log del servidor, vía `reason` acá abajo,
nunca en el mensaje que ve el cliente).

No importa nada de `app.modules.auth` más allá de esta lectura de JSON crudo -- ni
`AuthService` ni ningún modelo. Solo depende de `app.websocket.manager.ConnectionManager`
(mismo precedente ya establecido por `ModerationEventDispatcher`, que también importa
`ConnectionManager` directamente desde un módulo de dominio para poder cerrar
conexiones)."""

import json
import uuid

import structlog

from app.websocket import close_codes
from app.websocket.manager import ConnectionManager

logger = structlog.get_logger(__name__)

_RECOGNIZED_EVENT_TYPE = "auth.session_invalidated"

# Mensaje genérico -- nunca revela al cliente afectado SI fue logout, cambio de
# contraseña o suspensión (esa distinción queda en el log del servidor, ver `reason`
# más abajo). Mismo close code que ya usa el handshake de auth (`websocket/auth.py`)
# para "no autorizado" -- no se inventa uno nuevo, es semánticamente el mismo caso
# (una conexión sin sesión válida), solo en un punto distinto del ciclo de vida.
_CLOSE_REASON = "Tu sesión ya no es válida."


class SessionInvalidationDispatcher:
    def __init__(self, connection_manager: ConnectionManager) -> None:
        self._connection_manager = connection_manager

    async def dispatch(self, raw_payload: str | bytes) -> None:
        """Nunca lanza -- mismo contrato que `EventDispatcher.dispatch`/
        `ModerationEventDispatcher.dispatch`: un evento roto o un fallo puntual no debe
        tirar abajo el consumo del resto."""
        try:
            envelope = json.loads(raw_payload)
        except (TypeError, ValueError):
            logger.warning("session_invalidation_event_invalid_json", raw_payload=raw_payload)
            return
        if not isinstance(envelope, dict) or envelope.get("event_type") != _RECOGNIZED_EVENT_TYPE:
            return

        try:
            user_id = uuid.UUID(envelope["user_id"])
            raw_session_id = envelope.get("session_id")
            session_id = uuid.UUID(raw_session_id) if raw_session_id else None
            reason = str(envelope.get("reason", "session_invalidated"))
        except (KeyError, ValueError, TypeError):
            logger.warning("session_invalidation_event_malformed_payload")
            return

        try:
            marked_count = await self._connection_manager.close_connections(
                user_id=user_id,
                session_id=session_id,
                code=close_codes.UNAUTHORIZED,
                reason=_CLOSE_REASON,
            )
        except Exception:
            # Red de seguridad extra -- `close_connections` ya no debería lanzar (solo
            # setea estado en memoria, sin I/O), mismo criterio que
            # `ModerationEventDispatcher`/`EventConsumer._listen_once`.
            logger.exception("session_invalidation_mark_failed", user_id=str(user_id))
            return

        if marked_count:
            logger.info(
                "session_invalidation_dispatched",
                user_id=str(user_id),
                session_id=str(session_id) if session_id else None,
                reason=reason,
                marked_count=marked_count,
            )
