"""`ModerationEventDispatcher` -- reacciona a `oferta.rejected` para detectar intentos
reiterados de ofertas inválidas (Épica 7, Módulo 7.6). Ver
docs/42-moderacion-en-tiempo-real.md y ADR-045.

Mismo patrón exacto que `PostAuctionEventDispatcher`/`ChatSystemEventDispatcher`: una
instancia más de `EventConsumer` (`app/main.py`), lee el JSON crudo del evento sin
importar la clase `OfertaRejected` -- `app/modules/ofertas/` no sabe que este módulo
existe. Sesión nueva por evento (`session_factory` inyectado, no `Depends()`), nunca
lanza.
"""

import json
import uuid

import structlog
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.audit.repository import AuditLogRepository
from app.core.config import Settings
from app.events.bus import EventBus
from app.moderation.redis_state import ModerationRedisGateway
from app.moderation.repository import ModerationRepository
from app.moderation.service import ModerationService
from app.modules.chat.repository import ChatMessageRepository
from app.modules.remates.lotes.repository import LoteRepository
from app.modules.remates.repository import RemateRepository
from app.modules.remates.service import RemateService
from app.modules.users.repository import UserRepository
from app.notifications.repository import NotificationRepository
from app.presence.service import PresenceService
from app.websocket.manager import ConnectionManager
from app.websocket.rooms import RoomManager

logger = structlog.get_logger(__name__)

# Whitelist explícita -- mismo criterio que `SYSTEM_MESSAGE_BUILDERS`
# (`app/modules/chat/realtime.py`) y `EVENT_REGISTRY` (`app/realtime/registry.py`).
_RECOGNIZED_EVENT_TYPES = frozenset({"oferta.rejected"})


class ModerationEventDispatcher:
    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession],
        event_bus: EventBus,
        connection_manager: ConnectionManager,
        room_manager: RoomManager,
        redis_client: Redis,
        settings: Settings,
    ) -> None:
        self._session_factory = session_factory
        self._event_bus = event_bus
        self._connection_manager = connection_manager
        self._room_manager = room_manager
        self._redis_client = redis_client
        self._settings = settings

    async def dispatch(self, raw_payload: str | bytes) -> None:
        """Nunca lanza -- mismo contrato que `EventDispatcher.dispatch`."""
        try:
            envelope = json.loads(raw_payload)
        except (TypeError, ValueError):
            logger.warning("moderation_event_invalid_json", raw_payload=raw_payload)
            return
        if not isinstance(envelope, dict):
            return

        event_type = envelope.get("event_type")
        if event_type not in _RECOGNIZED_EVENT_TYPES:
            return

        try:
            remate_id = uuid.UUID(envelope["remate_id"])
            lote_id = uuid.UUID(envelope["lote_id"])
            buyer_id = uuid.UUID(envelope["buyer_id"])
            amount = str(envelope["amount"])
            reason = str(envelope["reason"])
        except (KeyError, ValueError, TypeError):
            logger.warning("moderation_event_malformed_payload", event_type=event_type)
            return

        try:
            async with self._session_factory() as db:
                audit_repository = AuditLogRepository(db)
                remate_repository = RemateRepository(db)
                presence_service = PresenceService(
                    self._room_manager, self._connection_manager, self._event_bus
                )
                remate_service = RemateService(
                    remate_repository, LoteRepository(db), self._event_bus, audit_repository
                )
                service = ModerationService(
                    ModerationRepository(db),
                    ModerationRedisGateway(self._redis_client),
                    self._connection_manager,
                    self._room_manager,
                    presence_service,
                    remate_service,
                    remate_repository,
                    ChatMessageRepository(db),
                    UserRepository(db),
                    audit_repository,
                    NotificationRepository(db),
                    self._event_bus,
                    self._settings,
                )
                await service.record_invalid_bid_attempt(
                    remate_id=remate_id,
                    lote_id=lote_id,
                    buyer_id=buyer_id,
                    amount=amount,
                    reason=reason,
                )
        except Exception:
            logger.exception("moderation_invalid_bid_tracking_failed", event_type=event_type)
