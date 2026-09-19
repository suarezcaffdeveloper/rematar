"""`TimedAuctionLifecycleScheduler` -- ciclo de vida automático de un remate TIMED
(Timed Auctions, ver plan de implementación). Sibling de `TimerExpiryScheduler`
(`app/timer/scheduler.py`, que cierra LOTES individuales al vencer su timer y es 100%
agnóstico a la modalidad -- ya funciona para lotes TIMED sin ningún cambio, en cuanto
tengan `timer_ends_at` seteado): este scheduler nuevo resuelve las dos transiciones que
son propias de un REMATE TIMED completo y que ningún código existente disparaba.

Mismo patrón ya establecido (`asyncio.create_task` en el `lifespan` de `app/main.py`,
sesión de base propia por tick, nunca reutiliza el `AsyncSession` de un request) y mismo
mecanismo de lock de fila (ADR-004, `RemateRepository.get_by_id_for_update`) para
serializarse contra una acción concurrente del rematador (ej. cancelar el remate justo
cuando este scheduler está por auto-iniciarlo o auto-finalizarlo) o contra el otro
scheduler (`TimerExpiryScheduler` cerrando el último lote abierto justo cuando este
scheduler evalúa si ya puede auto-finalizar).

Dos responsabilidades por tick, cada una acotada a `auction_type == TIMED` a nivel de la
propia consulta que trae los candidatos (`RemateRepository.list_timed_remates_due_to_start`/
`list_live_timed_remate_ids`) -- esto es, a propósito, lo que garantiza que un remate LIVE
nunca pasa por ninguno de los dos caminos de abajo, sin necesitar ningún chequeo adicional
en el cuerpo de cada uno:

1. **Auto-inicio**: un TIMED `SCHEDULED` cuyo `starts_at` ya venció pasa a `LIVE` y abre
   todos sus lotes `PENDING` en paralelo (`LoteService.open_all_pending_for_timed_start`),
   en la misma transacción -- nunca queda `LIVE` con lotes todavía sin abrir.
2. **Auto-finalización**: un TIMED `LIVE` sin ningún lote abierto pasa a `FINISHED`
   (`RemateService.auto_finish`). A propósito NO reintroduce el viejo RF-10/ADR-019 (ver
   docstring de `auto_finish`): el filtro por `auction_type` de arriba es la garantía de
   que esto nunca alcanza a un remate LIVE.
"""

import asyncio
import uuid
from datetime import UTC, datetime

import structlog
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.audit.repository import AuditLogRepository
from app.core.config import Settings
from app.events.bus import EventBus
from app.modules.remates.lotes.events import LoteOpened
from app.modules.remates.lotes.repository import LoteRepository
from app.modules.remates.lotes.service import LoteService
from app.modules.remates.models import RemateAuctionType, RemateStatus
from app.modules.remates.events import RemateStarted
from app.modules.remates.repository import RemateRepository
from app.modules.remates.service import RemateService

logger = structlog.get_logger(__name__)

DEFAULT_TICK_INTERVAL_SECONDS = 1.0


class TimedAuctionLifecycleScheduler:
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
        logger.info("timed_auction_lifecycle_scheduler_started")

    async def stop(self) -> None:
        self._stop_event.set()
        if self._task is not None:
            await self._task
        logger.info("timed_auction_lifecycle_scheduler_stopped")

    async def _run(self) -> None:
        while not self._stop_event.is_set():
            try:
                await self.tick()
            except Exception:  # noqa: BLE001 -- un tick roto nunca debe tumbar el scheduler
                logger.exception("timed_auction_lifecycle_scheduler_tick_failed")
            try:
                await asyncio.wait_for(
                    self._stop_event.wait(), timeout=self._tick_interval_seconds
                )
            except TimeoutError:
                pass

    async def tick(self) -> dict[str, int]:
        """Un ciclo de evaluación completo -- método público, sin bucle propio, para que
        los tests lo ejerciten directamente (`await scheduler.tick()`). Devuelve cuántos
        remates auto-inició y auto-finalizó en este ciclo."""
        async with self._session_factory() as db:
            now = datetime.now(UTC)
            started = 0
            for remate_id in await RemateRepository(db).list_timed_remates_due_to_start(now):
                if await self._try_start_one(db, remate_id, now):
                    started += 1

            finished = 0
            for remate_id in await RemateRepository(db).list_live_timed_remate_ids():
                if await self._try_finish_one(db, remate_id):
                    finished += 1

            return {"started": started, "finished": finished}

    async def _try_start_one(self, db: AsyncSession, remate_id: uuid.UUID, now: datetime) -> bool:
        remate_repository = RemateRepository(db)
        lote_repository = LoteRepository(db)
        audit_repository = AuditLogRepository(db)
        remate_service = RemateService(
            remate_repository, lote_repository, self._event_bus, audit_repository
        )
        lote_service = LoteService(
            lote_repository, remate_service, self._event_bus, self._settings, audit_repository
        )

        remate = await remate_repository.get_by_id_for_update(remate_id)
        if remate is None:
            return False
        if (
            remate.auction_type != RemateAuctionType.TIMED
            or remate.status != RemateStatus.SCHEDULED
            or remate.starts_at is None
            or remate.starts_at > now
        ):
            return False
        # Mismo requisito que RF-08 exige para el inicio manual de un LIVE
        # (`RemateService.start`) -- un remate programado antes de cargarle ningún lote
        # queda esperando, sin error, hasta que la empresa agregue al menos uno (sigue
        # pudiendo hacerlo: la estructura de lotes recién se congela al llegar a LIVE).
        if await lote_repository.count_by_remate(remate.id) == 0:
            return False

        remate_service.apply_auto_start(remate)
        opened = await lote_service.open_all_pending_for_timed_start(remate)
        await remate_repository.commit()
        await remate_repository.refresh(remate)

        await self._event_bus.publish(RemateStarted(remate_id=remate.id))
        for lote, timer_started in opened:
            await lote_repository.refresh(lote)
            await self._event_bus.publish(
                LoteOpened(
                    remate_id=remate.id,
                    lote_id=lote.id,
                    lot_number=lote.lot_number,
                    display_order=lote.display_order,
                )
            )
            await self._event_bus.publish(timer_started)
        return True

    async def _try_finish_one(self, db: AsyncSession, remate_id: uuid.UUID) -> bool:
        remate_repository = RemateRepository(db)
        lote_repository = LoteRepository(db)
        audit_repository = AuditLogRepository(db)
        remate_service = RemateService(
            remate_repository, lote_repository, self._event_bus, audit_repository
        )

        remate = await remate_repository.get_by_id_for_update(remate_id)
        if remate is None:
            return False
        if (
            remate.auction_type != RemateAuctionType.TIMED
            or remate.status != RemateStatus.LIVE
            or await lote_repository.has_open_lote(remate.id)
        ):
            return False

        await remate_service.auto_finish(remate)
        return True
