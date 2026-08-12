"""Runner en memoria de las simulaciones de bots (Iniciar/Pausar/Detener). Ver el plan
de arquitectura del módulo para el razonamiento completo.

`BotRunnerRegistry` es, deliberadamente, análogo a `RoomManager`
(`app/websocket/rooms.py`): un registro puramente in-process (`dict[remate_id, ...]`),
sin ninguna persistencia propia -- el estado "autoritativo" de si una simulación está
corriendo vive en `bot_simulation_runs` (Postgres); este registro es solo el conjunto de
tareas `asyncio` reales asociadas a esa fila mientras el proceso sigue vivo. Igual que
`ConnectionManager`/`RoomManager`, esto significa que el control de simulación solo es
confiable con una única instancia de backend -- límite conocido y documentado del MVP.

Cada `RemateBotRunner` reacciona a eventos de dominio ya publicados (inyectados por
`BotEventDispatcher`, nunca por polling): abrir un lote o que se acepte una oferta
agenda una tanda de reacciones con `asyncio.create_task` + `asyncio.sleep(delay
aleatorio)`, revalidando todo lo que pudo cambiar mientras dormía antes de llamar al
motor real -- mismo principio defensivo que `TimerExpiryScheduler._try_close_one`
(revalida después de tomar el lock). Cada reacción abre su propia sesión de base de
datos nueva (`session_factory`, nunca la del request que disparó Iniciar/Pausar/Detener,
que ya terminó para cuando la tarea despierta) y construye `AuctionEngine`/`ChatService`
con las mismas piezas que sus respectivas `dependencies.py` de producción -- exactamente
el mismo camino que un comprador real, sin ninguna lógica de validación duplicada.
"""

import asyncio
import contextlib
import random
import uuid
from dataclasses import dataclass
from decimal import Decimal

import structlog
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.audit.repository import AuditLogRepository
from app.core.config import Settings
from app.events.bus import EventBus
from app.modules.bots import strategy
from app.modules.bots.models import BotPersonality
from app.modules.bots.repository import BotRemateSelectionRepository
from app.modules.chat.repository import ChatMessageRepository
from app.modules.chat.schemas import ChatMessageCreate
from app.modules.chat.service import ChatService
from app.modules.ofertas.engine import AuctionEngine
from app.modules.ofertas.repository import OfertaRepository
from app.modules.ofertas.schemas import OfertaCreate
from app.modules.remates.lotes.repository import LoteRepository
from app.modules.remates.repository import RemateRepository
from app.modules.remates.service import RemateService
from app.modules.users.models import User
from app.redis.rate_limit import RedisRateLimiter

logger = structlog.get_logger(__name__)


@dataclass(frozen=True)
class _BotRuntimeProfile:
    """Snapshot inmutable de la configuración de un bot en el momento de sembrar una
    tanda de reacciones -- evita releer `BotProfile` en cada `await`; si la
    configuración cambia mientras el bot tiene una reacción en curso, se aplica recién
    en la próxima tanda (siguiente lote o siguiente oferta relevante)."""

    bot_profile_id: uuid.UUID
    user_id: uuid.UUID
    personality: BotPersonality
    max_budget: Decimal
    reaction_delay_min_seconds: int
    reaction_delay_max_seconds: int
    continue_probability: Decimal
    participates_in_chat: bool
    chat_message_frequency: Decimal


class RemateBotRunner:
    """Coordina las reacciones de todos los bots seleccionados y habilitados de UN
    remate. Vive dentro de `BotRunnerRegistry`, uno por remate con simulación
    `running`/`paused`."""

    def __init__(
        self,
        remate_id: uuid.UUID,
        session_factory: async_sessionmaker[AsyncSession],
        event_bus: EventBus,
        rate_limiter: RedisRateLimiter,
        settings: Settings,
        rng: random.Random | None = None,
    ) -> None:
        self._remate_id = remate_id
        self._session_factory = session_factory
        self._event_bus = event_bus
        self._rate_limiter = rate_limiter
        self._settings = settings
        self._rng = rng or random.Random()
        self._is_running = False
        self.active_lote_id: uuid.UUID | None = None
        self._bid_tasks: dict[uuid.UUID, asyncio.Task] = {}
        self._chat_tasks: dict[uuid.UUID, asyncio.Task] = {}

    @property
    def is_running(self) -> bool:
        return self._is_running

    def resume_flag(self) -> None:
        self._is_running = True

    def pause_flag(self) -> None:
        self._is_running = False

    async def cancel_all(self) -> None:
        """Cancela toda tarea pendiente y espera a que terminen (`return_exceptions`:
        una `CancelledError` esperada no debe propagarse) -- después de este `await`,
        garantizado que no queda ninguna reacción de este runner en vuelo."""
        tasks = [*self._bid_tasks.values(), *self._chat_tasks.values()]
        for task in tasks:
            task.cancel()
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
        self._bid_tasks.clear()
        self._chat_tasks.clear()

    def on_lote_opened(self, lote_id: uuid.UUID) -> None:
        self.active_lote_id = lote_id

    def on_lote_closed(self, lote_id: uuid.UUID) -> None:
        if self.active_lote_id == lote_id:
            self.active_lote_id = None

    async def seed_reactions_for_active_lote(self) -> None:
        """Programa la primera tanda de reacciones de todos los bots habilitados
        contra el lote activo -- llamado al abrir un lote, y también al Iniciar/
        Reanudar si ya había un lote `OPEN` en ese momento (no espera el próximo
        evento)."""
        if not self._is_running or self.active_lote_id is None:
            return
        lote_id = self.active_lote_id
        for profile in await self._load_enabled_profiles():
            self._schedule_bid_reaction(profile, lote_id)
            trigger = self._rng.choice(("lote_opened", "lote_question"))
            self._schedule_chat_reaction(profile, lote_id, trigger=trigger)

    async def react_to_offer_accepted(
        self, lote_id: uuid.UUID, leading_buyer_user_id: uuid.UUID
    ) -> None:
        if not self._is_running or self.active_lote_id != lote_id:
            return
        for profile in await self._load_enabled_profiles():
            if profile.user_id == leading_buyer_user_id:
                continue  # un bot no reacciona a su propia oferta recién aceptada
            self._schedule_bid_reaction(profile, lote_id)
            trigger = self._rng.choice(("oferta_accepted", "thinking"))
            self._schedule_chat_reaction(profile, lote_id, trigger=trigger)

    def _schedule_bid_reaction(self, profile: _BotRuntimeProfile, lote_id: uuid.UUID) -> None:
        existing = self._bid_tasks.get(profile.bot_profile_id)
        if existing is not None and not existing.done():
            return  # ya tiene una reacción de oferta pendiente, no se apilan intentos
        self._bid_tasks[profile.bot_profile_id] = asyncio.create_task(
            self._react_bid_after_delay(profile, lote_id),
            name=f"bot-bid-{profile.bot_profile_id}",
        )

    def _schedule_chat_reaction(
        self, profile: _BotRuntimeProfile, lote_id: uuid.UUID, *, trigger: str
    ) -> None:
        if not profile.participates_in_chat:
            return
        if not strategy.decide_send_chat_message(profile.chat_message_frequency, rng=self._rng):
            return
        existing = self._chat_tasks.get(profile.bot_profile_id)
        if existing is not None and not existing.done():
            return
        self._chat_tasks[profile.bot_profile_id] = asyncio.create_task(
            self._react_chat_after_delay(profile, lote_id, trigger=trigger),
            name=f"bot-chat-{profile.bot_profile_id}",
        )

    async def _react_bid_after_delay(self, profile: _BotRuntimeProfile, lote_id: uuid.UUID) -> None:
        delay = strategy.decide_initial_delay_seconds(
            profile.reaction_delay_min_seconds, profile.reaction_delay_max_seconds, rng=self._rng
        )
        with contextlib.suppress(asyncio.CancelledError):
            await asyncio.sleep(delay)
            try:
                await self._attempt_bid(profile, lote_id)
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception(
                    "bot_bid_reaction_failed", bot_profile_id=str(profile.bot_profile_id)
                )

    async def _react_chat_after_delay(
        self, profile: _BotRuntimeProfile, lote_id: uuid.UUID, *, trigger: str
    ) -> None:
        delay = strategy.decide_initial_delay_seconds(
            profile.reaction_delay_min_seconds, profile.reaction_delay_max_seconds, rng=self._rng
        )
        with contextlib.suppress(asyncio.CancelledError):
            await asyncio.sleep(delay)
            try:
                await self._attempt_chat(profile, lote_id, trigger=trigger)
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception(
                    "bot_chat_reaction_failed", bot_profile_id=str(profile.bot_profile_id)
                )

    async def _attempt_bid(self, profile: _BotRuntimeProfile, lote_id: uuid.UUID) -> None:
        # Revalida todo lo que pudo cambiar mientras la tarea dormía: la simulación
        # pudo pausarse/detenerse, o el lote activo pudo cambiar (cerrarse, o abrirse
        # otro). `AuctionEngine.place_bid` revalida además, con el lote bloqueado,
        # remate LIVE/lote OPEN/incremento mínimo -- esto es solo para no llamarlo en
        # vano cuando ya se sabe que va a rechazar.
        if not self._is_running or self.active_lote_id != lote_id:
            return

        async with self._session_factory() as db:
            audit_repository = AuditLogRepository(db)
            lote_repository = LoteRepository(db)
            oferta_repository = OfertaRepository(db)
            remate_service = RemateService(
                RemateRepository(db), lote_repository, self._event_bus, audit_repository
            )
            engine = AuctionEngine(
                oferta_repository, remate_service, lote_repository, self._event_bus, audit_repository
            )

            buyer = await db.get(User, profile.user_id)
            if buyer is None:
                return

            lote = await lote_repository.get_by_id(lote_id)
            if lote is None:
                return

            leading_amount = await engine.get_leading_amount(self._remate_id, lote_id, buyer)
            if leading_amount is not None and not strategy.decide_continue_bidding(
                profile.continue_probability, rng=self._rng
            ):
                self._schedule_chat_reaction(profile, lote_id, trigger="give_up")
                return

            amount = strategy.decide_bid_amount(
                leading_amount=leading_amount,
                base_price=lote.base_price,
                min_increment=lote.min_increment,
                max_budget=profile.max_budget,
                personality=profile.personality,
                rng=self._rng,
            )
            if amount is None:
                # el piso mínimo ya supera su presupuesto: abandona este lote
                self._schedule_chat_reaction(profile, lote_id, trigger="give_up")
                return

            await engine.place_bid(self._remate_id, lote_id, buyer, OfertaCreate(amount=amount))

    async def _attempt_chat(
        self, profile: _BotRuntimeProfile, lote_id: uuid.UUID, *, trigger: str
    ) -> None:
        if not self._is_running or self.active_lote_id != lote_id:
            return
        async with self._session_factory() as db:
            audit_repository = AuditLogRepository(db)
            remate_service = RemateService(
                RemateRepository(db), LoteRepository(db), self._event_bus, audit_repository
            )
            chat_service = ChatService(
                ChatMessageRepository(db),
                remate_service,
                self._event_bus,
                self._rate_limiter,
                self._settings,
                audit_repository,
            )
            buyer = await db.get(User, profile.user_id)
            if buyer is None:
                return
            content = strategy.build_chat_message(
                trigger, personality=profile.personality, rng=self._rng
            )
            await chat_service.send_message(self._remate_id, buyer, ChatMessageCreate(content=content))

    async def _load_enabled_profiles(self) -> list[_BotRuntimeProfile]:
        async with self._session_factory() as db:
            roster = await BotRemateSelectionRepository(db).list_roster(self._remate_id)
            return [
                _BotRuntimeProfile(
                    bot_profile_id=selection.bot_profile_id,
                    user_id=bot_profile.user_id,
                    personality=bot_profile.personality,
                    max_budget=bot_profile.max_budget,
                    reaction_delay_min_seconds=bot_profile.reaction_delay_min_seconds,
                    reaction_delay_max_seconds=bot_profile.reaction_delay_max_seconds,
                    continue_probability=bot_profile.continue_probability,
                    participates_in_chat=bot_profile.participates_in_chat,
                    chat_message_frequency=bot_profile.chat_message_frequency,
                )
                for selection, bot_profile in roster
                if selection.is_enabled and bot_profile.is_active
            ]


class BotRunnerRegistry:
    """Registro en memoria de un `RemateBotRunner` por remate con simulación
    `running`/`paused` -- ver docstring del módulo."""

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
        self._runners: dict[uuid.UUID, RemateBotRunner] = {}

    def get(self, remate_id: uuid.UUID) -> RemateBotRunner | None:
        return self._runners.get(remate_id)

    def _get_or_create(self, remate_id: uuid.UUID) -> RemateBotRunner:
        runner = self._runners.get(remate_id)
        if runner is None:
            runner = RemateBotRunner(
                remate_id, self._session_factory, self._event_bus, self._rate_limiter, self._settings
            )
            self._runners[remate_id] = runner
        return runner

    async def start(self, remate_id: uuid.UUID, active_lote_id: uuid.UUID | None) -> None:
        runner = self._get_or_create(remate_id)
        runner.resume_flag()
        if active_lote_id is not None:
            runner.active_lote_id = active_lote_id
        await runner.seed_reactions_for_active_lote()

    async def pause(self, remate_id: uuid.UUID) -> None:
        runner = self._runners.get(remate_id)
        if runner is None:
            return
        runner.pause_flag()
        await runner.cancel_all()

    async def stop(self, remate_id: uuid.UUID) -> None:
        runner = self._runners.pop(remate_id, None)
        if runner is None:
            return
        runner.pause_flag()
        await runner.cancel_all()

    async def resume(self, remate_id: uuid.UUID) -> None:
        runner = self._get_or_create(remate_id)
        runner.resume_flag()
        await runner.seed_reactions_for_active_lote()

    async def notify_lote_opened(self, remate_id: uuid.UUID, lote_id: uuid.UUID) -> None:
        runner = self._runners.get(remate_id)
        if runner is None:
            return
        runner.on_lote_opened(lote_id)
        await runner.seed_reactions_for_active_lote()

    async def notify_lote_closed(self, remate_id: uuid.UUID, lote_id: uuid.UUID) -> None:
        runner = self._runners.get(remate_id)
        if runner is None:
            return
        runner.on_lote_closed(lote_id)
        await runner.cancel_all()

    async def notify_offer_accepted(
        self, remate_id: uuid.UUID, lote_id: uuid.UUID, buyer_id: uuid.UUID
    ) -> None:
        runner = self._runners.get(remate_id)
        if runner is None:
            return
        await runner.react_to_offer_accepted(lote_id, buyer_id)

    async def shutdown(self) -> None:
        """Cancela toda tarea de todo runner -- llamado desde el shutdown de
        `_lifespan`, antes de cerrar Redis, mismo criterio que el resto de los
        consumidores de fondo."""
        for remate_id in list(self._runners.keys()):
            await self.stop(remate_id)
