"""`PostAuctionEventDispatcher` -- reacciona a `lote.winner_determined` para crear
automáticamente un caso post-remate (Épica 7, Módulo 7.5). Ver
docs/41-gestion-post-remate.md y ADR-044.

Implementa el mismo contrato estructural (`dispatch(raw_payload)`) que
`app/realtime/dispatcher.py::EventDispatcher`, pero para un consumidor **independiente**
(una instancia más de `EventConsumer`, ver `app/main.py`) -- no importa nada de
`app/websocket/` ni de `app/realtime/`, y tampoco importa la clase de evento
`LoteWinnerDetermined`: igual que `ChatSystemEventDispatcher`
(`app/modules/chat/realtime.py`), lee el JSON crudo del evento ya publicado y arma sus
propios datos a mano -- así `app/modules/remates/lotes/` no necesita saber que este
módulo existe.

Construye sus propias dependencias por mensaje (una sesión nueva por evento, no
`Depends()`): corre como tarea de fondo, no dentro de un request HTTP. El
`session_factory` se recibe por constructor (mismo motivo que `ChatSystemEventDispatcher`:
un `async_sessionmaker` está atado al event loop en el que se creó su engine, y los tests
necesitan poder inyectar el suyo propio).
"""

import json
import uuid
from decimal import Decimal

import structlog
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.audit.repository import AuditLogRepository
from app.events.bus import EventBus
from app.modules.remates.lotes.repository import LoteRepository
from app.modules.remates.repository import RemateRepository
from app.modules.users.repository import UserRepository
from app.notifications.repository import NotificationRepository
from app.postauction.repository import PostAuctionRepository
from app.postauction.service import PostAuctionService

logger = structlog.get_logger(__name__)

# Whitelist explícita -- mismo criterio que `SYSTEM_MESSAGE_BUILDERS`
# (`app/modules/chat/realtime.py`) y `EVENT_REGISTRY` (`app/realtime/registry.py`): un
# evento de dominio nuevo no dispara nada acá hasta que alguien lo agregue a propósito.
_RECOGNIZED_EVENT_TYPES = frozenset({"lote.winner_determined"})


class PostAuctionEventDispatcher:
    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession],
        event_bus: EventBus,
    ) -> None:
        self._session_factory = session_factory
        self._event_bus = event_bus

    async def dispatch(self, raw_payload: str | bytes) -> None:
        """Nunca lanza -- mismo contrato que `EventDispatcher.dispatch`: un evento roto o
        una falla puntual de escritura no debe tirar abajo la suscripción."""
        try:
            envelope = json.loads(raw_payload)
        except (TypeError, ValueError):
            logger.warning("postauction_event_invalid_json", raw_payload=raw_payload)
            return
        if not isinstance(envelope, dict):
            return

        event_type = envelope.get("event_type")
        if event_type not in _RECOGNIZED_EVENT_TYPES:
            # Incluye, a propósito, los propios `postauction.*` que este mismo módulo
            # publica (sin esto habría un loop) y cualquier otro evento del sistema.
            return

        try:
            remate_id = uuid.UUID(envelope["remate_id"])
            lote_id = uuid.UUID(envelope["lote_id"])
            buyer_id = uuid.UUID(envelope["buyer_id"])
            final_price = Decimal(str(envelope["amount"]))
        except (KeyError, ValueError, TypeError, ArithmeticError):
            logger.warning("postauction_event_malformed_payload", event_type=event_type)
            return

        try:
            async with self._session_factory() as db:
                audit_repository = AuditLogRepository(db)
                service = PostAuctionService(
                    PostAuctionRepository(db),
                    RemateRepository(db),
                    LoteRepository(db),
                    UserRepository(db),
                    audit_repository,
                    NotificationRepository(db),
                    self._event_bus,
                )
                await service.create_case_from_winner(
                    remate_id=remate_id,
                    lote_id=lote_id,
                    buyer_id=buyer_id,
                    final_price=final_price,
                )
        except Exception:
            logger.exception("postauction_case_creation_failed", event_type=event_type)
