"""`TimerExpiryScheduler` -- cierre automático de lotes al vencer su timer (Épica 8,
"cuenta regresiva y cierre automático"). Ver docs/40-cuenta-regresiva-y-cierre-automatico.md
y ADR-043.

A diferencia del arranque del timer (`LoteService.open`) y la extensión anti-sniping
(`AuctionEngine.place_bid`), que reaccionan a una llamada ya existente, "se acabó el
tiempo" no es consecuencia de ninguna acción -- nada lo dispara por sí solo. Por eso
hace falta una tarea de fondo nueva, con el mismo patrón ya establecido por
`app/realtime/consumer.py::EventConsumer` y
`app/modules/chat/realtime.py::ChatSystemEventDispatcher`: arranca/se detiene en el
`lifespan` de `app/main.py`, una sesión de base propia por tick (nunca reutiliza el
`AsyncSession` de un request).

Cada tick: busca candidatos (`LoteRepository.list_expired_open_lote_ids`), y para cada
uno, adquiere el lock de fila (`LoteRepository.get_by_id_for_update`, ADR-004 -- el
mismo mecanismo que ya serializa ofertas concurrentes, acá usado por primera vez por
algo que no es el Auction Engine) para serializarse contra un bid o una acción del
rematador en curso sobre ese mismo lote. Revalida todo DESPUÉS de tomar el lock (pudo
haberse extendido/pausado/cerrado, o el remate pausarse, mientras esperaba) -- si ya no
corresponde cerrar, lo salta sin tocar nada.
"""

import asyncio
import uuid
from datetime import UTC, datetime

import structlog
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.audit.repository import AuditLogRepository
from app.core.config import Settings
from app.events.bus import EventBus
from app.modules.ofertas.repository import OfertaRepository
from app.modules.remates.lotes.events import LoteTimerExpired
from app.modules.remates.lotes.models import LoteStatus
from app.modules.remates.lotes.repository import LoteRepository
from app.modules.remates.lotes.service import LoteService
from app.modules.remates.models import RemateStatus
from app.modules.remates.repository import RemateRepository
from app.modules.remates.service import RemateService

logger = structlog.get_logger(__name__)

DEFAULT_TICK_INTERVAL_SECONDS = 1.0


class TimerExpiryScheduler:
    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession],
        event_bus: EventBus,
        settings: Settings,
        *,
        tick_interval_seconds: float = DEFAULT_TICK_INTERVAL_SECONDS,
    ) -> None:
        self._session_factory = session_factory
        self._event_bus = event_bus
        self._settings = settings
        self._tick_interval_seconds = tick_interval_seconds
        self._task: asyncio.Task[None] | None = None
        self._stop_event = asyncio.Event()

    def start(self) -> None:
        self._task = asyncio.create_task(self._run())
        logger.info("timer_expiry_scheduler_started")

    async def stop(self) -> None:
        self._stop_event.set()
        if self._task is not None:
            await self._task
        logger.info("timer_expiry_scheduler_stopped")

    async def _run(self) -> None:
        while not self._stop_event.is_set():
            try:
                await self.tick()
            except Exception:  # noqa: BLE001 -- un tick roto nunca debe tumbar el scheduler
                logger.exception("timer_expiry_scheduler_tick_failed")
            try:
                await asyncio.wait_for(
                    self._stop_event.wait(), timeout=self._tick_interval_seconds
                )
            except TimeoutError:
                pass

    async def tick(self) -> int:
        """Un ciclo de evaluación completo -- método público, sin bucle propio, para
        que los tests lo ejerciten directamente (`await scheduler.tick()`) sin levantar
        la tarea de fondo. Devuelve cuántos lotes cerró en este ciclo."""
        async with self._session_factory() as db:
            candidate_ids = await LoteRepository(db).list_expired_open_lote_ids(datetime.now(UTC))
            closed = 0
            for lote_id in candidate_ids:
                if await self._try_close_one(db, lote_id):
                    closed += 1
            return closed

    async def _try_close_one(self, db: AsyncSession, lote_id: uuid.UUID) -> bool:
        lote_repository = LoteRepository(db)
        remate_repository = RemateRepository(db)

        lote = await lote_repository.get_by_id_for_update(lote_id)
        if lote is None:
            return False
        remate = await remate_repository.get_by_id(lote.remate_id)
        if remate is None:
            return False

        now = datetime.now(UTC)
        if (
            lote.status != LoteStatus.OPEN
            or lote.timer_ends_at is None
            or lote.timer_ends_at > now
            or not lote.timer_auto_close_enabled
            # Un remate pausado congela todo -- nadie puede ofertar mientras tanto, así
            # que adjudicar automáticamente ahora sería injusto (ver docs/40, sección
            # "por qué el cierre automático respeta la pausa del remate"). El timer
            # sigue vencido en términos absolutos; el próximo tick después de
            # reanudar lo cierra.
            or remate.status != RemateStatus.LIVE
        ):
            return False

        await self._event_bus.publish(LoteTimerExpired(remate_id=remate.id, lote_id=lote.id))

        leading = await OfertaRepository(db).get_leading_offer(lote.id)

        audit_repository = AuditLogRepository(db)
        lote_service = LoteService(
            lote_repository,
            RemateService(remate_repository, lote_repository, self._event_bus, audit_repository),
            self._event_bus,
            self._settings,
            audit_repository,
        )
        await lote_service.auto_close(
            lote,
            remate,
            leading_oferta_id=leading.id if leading is not None else None,
            leading_buyer_id=leading.buyer_id if leading is not None else None,
            leading_amount=leading.amount if leading is not None else None,
        )
        return True
