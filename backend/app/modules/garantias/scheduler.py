"""`GarantiaExpiryScheduler` -- Fase 6 del plan de Garantía Económica: política de
expiración de la preautorización.

Una preautorización de tarjeta tiene una ventana de validez limitada
(`Settings.MERCADOPAGO_HOLD_VALIDITY_DAYS`, ver `Garantia.expires_at`). Pasado ese punto,
Mercado Pago la libera sola del lado del emisor -- nada dispara un evento propio para
avisarlo acá, así que hace falta una tarea de fondo que lo detecte, mismo motivo que
`app/timer/scheduler.py::TimerExpiryScheduler` ("nada lo dispara por sí solo"). Mismo
patrón de arranque/parada (`start`/`stop`/`_run`, una sesión de base nueva por tick) y
mismo motivo de intervalo configurable en el constructor para los tests.

Cada tick hace dos cosas, en orden:
1. **Expira** toda `Garantia` `ACTIVE` cuyo `expires_at` ya pasó -- sin tocar Mercado
   Pago (el hold ya se liberó solo de su lado, ver docstring de `models.py`); es un
   cambio de estado puramente local, para que la fila no siga "mintiendo" `ACTIVE`. El
   gate de `AuctionEngine.place_bid` trata `EXPIRED` igual que "sin garantía".
2. **Avisa** al comprador (notificación in-app, `app.notifications`, no email/WhatsApp --
   ver el plan: agregar esos canales exigiría una plantilla nueva aprobada en Meta
   Business Manager para WhatsApp, fuera de alcance de esta fase) cuando su garantía
   `ACTIVE` entra en la ventana de `Settings.GUARANTEE_EXPIRY_WARNING_HOURS` antes de
   vencer, pidiéndole que vuelva a autorizarla (repetir `POST .../garantia`, que
   reemplaza el hold próximo a vencer por uno nuevo sobre la misma fila -- ver
   `GarantiaService.create_or_retry`). `Garantia.expiry_warning_sent_at` evita mandarlo
   más de una vez por garantía.
"""

import asyncio
from datetime import UTC, datetime, timedelta

import structlog
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import Settings
from app.modules.garantias.models import Garantia, GarantiaEvent, GarantiaStatus
from app.modules.garantias.repository import GarantiaRepository
from app.notifications.repository import NotificationRepository

logger = structlog.get_logger(__name__)

DEFAULT_TICK_INTERVAL_SECONDS = 300.0


class GarantiaExpiryScheduler:
    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession],
        settings: Settings,
        *,
        tick_interval_seconds: float = DEFAULT_TICK_INTERVAL_SECONDS,
    ) -> None:
        self._session_factory = session_factory
        self._settings = settings
        self._tick_interval_seconds = tick_interval_seconds
        self._task: asyncio.Task[None] | None = None
        self._stop_event = asyncio.Event()

    def start(self) -> None:
        self._task = asyncio.create_task(self._run())
        logger.info("garantia_expiry_scheduler_started")

    async def stop(self) -> None:
        self._stop_event.set()
        if self._task is not None:
            await self._task
        logger.info("garantia_expiry_scheduler_stopped")

    async def _run(self) -> None:
        while not self._stop_event.is_set():
            try:
                await self.tick()
            except Exception:  # noqa: BLE001 -- un tick roto nunca debe tumbar el scheduler
                logger.exception("garantia_expiry_scheduler_tick_failed")
            try:
                await asyncio.wait_for(
                    self._stop_event.wait(), timeout=self._tick_interval_seconds
                )
            except TimeoutError:
                pass

    async def tick(self) -> tuple[int, int]:
        """Un ciclo completo -- método público, sin bucle propio, para que los tests lo
        ejerciten directamente (`await scheduler.tick()`). Devuelve
        `(expiradas, avisos_mandados)` en este ciclo."""
        async with self._session_factory() as db:
            expired = await self._expire_overdue(db)
            warned = await self._warn_expiring_soon(db)
            return expired, warned

    async def _expire_overdue(self, db: AsyncSession) -> int:
        repository = GarantiaRepository(db)
        now = datetime.now(UTC)
        overdue = await repository.list_active_expiring_before(now)
        for garantia in overdue:
            garantia.status = GarantiaStatus.EXPIRED
            repository.add_event(
                GarantiaEvent(garantia_id=garantia.id, occurred_at=now, event_type="expired")
            )
            logger.info(
                "garantia_expired", garantia_id=str(garantia.id), remate_id=str(garantia.remate_id)
            )
        if overdue:
            await repository.commit()
        return len(overdue)

    async def _warn_expiring_soon(self, db: AsyncSession) -> int:
        repository = GarantiaRepository(db)
        notification_repository = NotificationRepository(db)
        now = datetime.now(UTC)
        threshold = now + timedelta(hours=self._settings.GUARANTEE_EXPIRY_WARNING_HOURS)
        # Ya sin las vencidas (recién marcadas EXPIRED arriba, en la misma sesión --
        # autoflush deja que esta consulta las vea actualizadas) -- lo que queda acá
        # todavía está ACTIVE, solo próximo a vencer.
        candidates = await repository.list_active_expiring_before(threshold)
        to_warn = [g for g in candidates if g.expiry_warning_sent_at is None]
        for garantia in to_warn:
            self._notify_expiring_soon(notification_repository, garantia)
            garantia.expiry_warning_sent_at = now
            repository.add_event(
                GarantiaEvent(
                    garantia_id=garantia.id, occurred_at=now, event_type="expiry_warning_sent"
                )
            )
            logger.info(
                "garantia_expiry_warning_sent",
                garantia_id=str(garantia.id),
                remate_id=str(garantia.remate_id),
            )
        if to_warn:
            await repository.commit()
        return len(to_warn)

    @staticmethod
    def _notify_expiring_soon(
        notification_repository: NotificationRepository, garantia: Garantia
    ) -> None:
        notification_repository.create(
            user_id=garantia.buyer_id,
            type="garantia.expiry_warning",
            title="Tu garantía económica está por vencer",
            message=(
                "La garantía que constituiste para ofertar en este remate está por "
                "vencer. Volvé a autorizarla para seguir participando."
            ),
            resource_type="garantia",
            resource_id=garantia.id,
            remate_id=garantia.remate_id,
        )
