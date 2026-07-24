"""`ChatSystemEventDispatcher` — genera mensajes de sistema del chat a partir de
eventos de dominio de ciclo de vida (Épica 6, Módulo 6.4). Ver
docs/34-chat-del-remate.md y ADR-037.

Implementa el mismo contrato estructural (`dispatch(raw_payload)`) que
`app/realtime/dispatcher.py::EventDispatcher`, pero para un consumidor **independiente**
(una segunda instancia de `EventConsumer`, ver `app/main.py`) — no importa nada de
`app/websocket/` ni de `app/realtime/`: reacciona a eventos de dominio ya publicados
(`RemateStarted`, `LoteOpened`, etc., sin importar sus clases -- solo lee el JSON crudo,
igual que `EventDispatcher`) y persiste + publica un `ChatMessageSent` propio a través
de `ChatService`, que sigue el camino normal (`app/realtime/registry.py`) hacia los
clientes conectados. `app/modules/remates/`/`app/modules/ofertas/` no saben que esto
existe -- mismo principio que ya aplica todo el proyecto (el dominio publica, no sabe
quién consume).

Construye sus propias dependencias por mensaje (una sesión nueva por evento, no
`Depends()`): corre como tarea de fondo, no dentro de un request HTTP. El
`session_factory` se recibe por constructor (`app/main.py` pasa `AsyncSessionLocal`,
`app/db/session.py`) en vez de importarlo acá como global -- un `async_sessionmaker`
está atado al event loop en el que se creó su engine, y los tests (un loop nuevo por
test, ver docstring de `tests/conftest.py`) necesitan poder inyectar el suyo propio.
"""

import json
import uuid
from collections.abc import Callable

import structlog
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.audit.repository import AuditLogRepository
from app.core.config import Settings
from app.events.bus import EventBus
from app.modules.chat.repository import ChatMessageRepository
from app.modules.chat.service import ChatService
from app.modules.remates.lotes.repository import LoteRepository
from app.modules.remates.repository import RemateRepository
from app.modules.remates.service import RemateService
from app.redis.rate_limit import RedisRateLimiter

logger = structlog.get_logger(__name__)


def _remate_started_text(_payload: dict) -> str:
    return "El remate comenzó."


def _remate_paused_text(_payload: dict) -> str:
    return "El remate fue pausado."


def _remate_resumed_text(_payload: dict) -> str:
    return "El remate se reanudó."


def _remate_finished_text(_payload: dict) -> str:
    return "El remate finalizó."


def _lote_opened_text(payload: dict) -> str:
    lot_number = payload.get("lot_number")
    return f"Se abrió el lote {lot_number}." if lot_number else "Se abrió un lote."


def _lote_closed_text(payload: dict) -> str:
    if payload.get("outcome") == "sold":
        return "Se cerró un lote (vendido)."
    return "Se cerró un lote (sin vender)."


def _moderation_user_kicked_text(payload: dict) -> str:
    name = payload.get("user_name")
    return f"{name} fue expulsado del remate." if name else "Un comprador fue expulsado del remate."


def _moderation_user_muted_text(payload: dict) -> str:
    name = payload.get("user_name")
    who = name or "Un comprador"
    duration = payload.get("duration_seconds")
    minutes = f"{int(duration) // 60} min" if isinstance(duration, int | float) else None
    return f"{who} fue silenciado{f' por {minutes}' if minutes else ''}."


# Whitelist explícita -- mismo criterio que `EVENT_REGISTRY` (app/realtime/registry.py):
# un evento de dominio nuevo no genera un mensaje de sistema hasta que alguien lo agregue
# acá a propósito. Cada función usa únicamente campos que el evento ya trae en su
# payload -- ninguna consulta extra a la base.
#
# Deliberadamente **no** incluidos (Épica 7, Módulo 7.6): `moderacion.mensaje_destacado`/
# `mensaje_no_destacado` (destacar es un cambio visual, un anuncio de sistema sería
# ruido) ni `moderacion.umbral_ofertas_invalidas_superado` (nunca debe anunciarse en un
# canal público el patrón de ofertas fallidas de un comprador puntual -- ver
# docstring de `app/moderation/events.py::ModerationInvalidBidThresholdExceeded`).
SYSTEM_MESSAGE_BUILDERS: dict[str, Callable[[dict], str]] = {
    "remate.started": _remate_started_text,
    "remate.paused": _remate_paused_text,
    "remate.resumed": _remate_resumed_text,
    "remate.finished": _remate_finished_text,
    "lote.opened": _lote_opened_text,
    "lote.closed": _lote_closed_text,
    "moderacion.usuario_expulsado": _moderation_user_kicked_text,
    "moderacion.usuario_silenciado": _moderation_user_muted_text,
}


class ChatSystemEventDispatcher:
    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession],
        event_bus: EventBus,
        rate_limiter: RedisRateLimiter,
        settings: Settings,
    ) -> None:
        self._session_factory = session_factory
        self._event_bus = event_bus
        self._rate_limiter = rate_limiter
        self._settings = settings

    async def dispatch(self, raw_payload: str | bytes) -> None:
        """Nunca lanza -- mismo contrato que `EventDispatcher.dispatch`: un evento roto
        o una falla puntual de escritura no debe tirar abajo la suscripción."""
        try:
            envelope = json.loads(raw_payload)
        except (TypeError, ValueError):
            logger.warning("chat_system_event_invalid_json", raw_payload=raw_payload)
            return
        if not isinstance(envelope, dict):
            return

        event_type = envelope.get("event_type")
        builder = SYSTEM_MESSAGE_BUILDERS.get(event_type)
        if builder is None:
            # No es un evento de ciclo de vida reconocido -- incluye, a propósito, los
            # propios `chat.*` que este mismo módulo publica (sin esto habría un loop).
            return

        remate_id_raw = envelope.get("remate_id")
        event_id_raw = envelope.get("event_id")
        if not remate_id_raw or not event_id_raw:
            logger.warning("chat_system_event_missing_ids", event_type=event_type)
            return

        try:
            remate_id = uuid.UUID(remate_id_raw)
            source_event_id = uuid.UUID(event_id_raw)
            content = builder(envelope)
        except (ValueError, TypeError):
            logger.warning("chat_system_event_malformed_payload", event_type=event_type)
            return

        try:
            async with self._session_factory() as db:
                audit_repository = AuditLogRepository(db)
                chat_service = ChatService(
                    ChatMessageRepository(db),
                    RemateService(
                        RemateRepository(db), LoteRepository(db), self._event_bus, audit_repository
                    ),
                    self._event_bus,
                    self._rate_limiter,
                    self._settings,
                    audit_repository,
                )
                await chat_service.record_system_message(
                    remate_id,
                    content,
                    system_event_type=event_type,
                    source_event_id=source_event_id,
                )
        except Exception:
            logger.exception("chat_system_message_failed", event_type=event_type)
