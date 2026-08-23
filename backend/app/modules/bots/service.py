"""Servicios del módulo de bots simuladores de compradores.

`BotProfileService` es CRUD puro (con el detalle de que `create` también provisiona el
`User` backing, ver docstring de `models.py`). `BotSimulationService` es el único punto
que combina persistencia (`bot_simulation_runs`) con el registro en memoria
(`BotRunnerRegistry`) -- ver docstring de `runner.py` para por qué esa combinación es
necesaria (las tareas `asyncio` no existen en la base).
"""

import secrets
import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import BusinessRuleError, NotFoundError
from app.core.security import hash_password
from app.events.bus import EventBus
from app.modules.bots.events import BotSimulationPaused, BotSimulationStarted, BotSimulationStopped
from app.modules.bots.models import BotProfile, BotSimulationRun, BotSimulationStatus
from app.modules.bots.repository import (
    BotProfileRepository,
    BotRemateSelectionRepository,
    BotSimulationRunRepository,
)
from app.modules.bots.runner import BotRunnerRegistry
from app.modules.bots.schemas import BotProfileCreate, BotProfileUpdate, BotRosterEntry
from app.modules.remates.lotes.models import Lote, LoteStatus
from app.modules.remates.service import RemateService
from app.modules.users.models import User, UserRole
from app.modules.users.repository import UserRepository

_BOT_EMAIL_DOMAIN = "bots.rematar.internal"


class BotProfileService:
    def __init__(
        self,
        repository: BotProfileRepository,
        user_repository: UserRepository,
        selection_repository: BotRemateSelectionRepository,
        run_repository: BotSimulationRunRepository,
    ) -> None:
        self._repository = repository
        self._user_repository = user_repository
        self._selection_repository = selection_repository
        self._run_repository = run_repository

    async def create(self, owner: User, data: BotProfileCreate) -> BotProfile:
        # `User` backing (rol comprador): dominio de email inexistente a propósito
        # (ver docstring del módulo `models.py`) -- ningún email real recibe nunca
        # nada a nombre de un bot, y la contraseña aleatoria nunca se comunica a
        # nadie, así que el bot no puede autenticarse por su cuenta.
        backing_user = User(
            email=f"bot+{uuid.uuid4()}@{_BOT_EMAIL_DOMAIN}",
            hashed_password=hash_password(secrets.token_urlsafe(32)),
            full_name=data.display_name,
            role=UserRole.COMPRADOR,
            is_active=True,
        )
        self._user_repository.add(backing_user)
        await self._user_repository.commit()
        await self._user_repository.refresh(backing_user)

        profile = BotProfile(
            created_by_id=owner.id,
            user_id=backing_user.id,
            display_name=data.display_name,
            personality=data.personality,
            max_budget=data.max_budget,
            reaction_delay_min_seconds=data.reaction_delay_min_seconds,
            reaction_delay_max_seconds=data.reaction_delay_max_seconds,
            continue_probability=data.continue_probability,
            participates_in_chat=data.participates_in_chat,
            chat_message_frequency=data.chat_message_frequency,
        )
        self._repository.add(profile)
        await self._repository.commit()
        await self._repository.refresh(profile)
        return profile

    async def list_for_owner(self, owner: User) -> list[BotProfile]:
        if owner.role == UserRole.ADMIN:
            return await self._repository.list_all()
        return await self._repository.list_by_owner(owner.id)

    async def get_owned_or_raise(self, bot_profile_id: uuid.UUID, owner: User) -> BotProfile:
        profile = await self._repository.get_by_id(bot_profile_id)
        if profile is None:
            raise NotFoundError("Bot no encontrado.")
        if owner.role != UserRole.ADMIN and profile.created_by_id != owner.id:
            # 404, no 403 -- mismo criterio que RemateService.get_visible_or_raise: no
            # confirma la existencia de un bot ajeno a quien no debería ni saberlo.
            raise NotFoundError("Bot no encontrado.")
        return profile

    async def update(
        self, bot_profile_id: uuid.UUID, owner: User, data: BotProfileUpdate
    ) -> BotProfile:
        profile = await self.get_owned_or_raise(bot_profile_id, owner)
        changes = data.model_dump(exclude_unset=True)

        min_delay = changes.get("reaction_delay_min_seconds", profile.reaction_delay_min_seconds)
        max_delay = changes.get("reaction_delay_max_seconds", profile.reaction_delay_max_seconds)
        if max_delay < min_delay:
            raise BusinessRuleError(
                "El tiempo de reacción máximo debe ser mayor o igual al mínimo."
            )

        for field, value in changes.items():
            setattr(profile, field, value)

        await self._repository.commit()
        await self._repository.refresh(profile)
        return profile

    async def delete(self, bot_profile_id: uuid.UUID, owner: User) -> None:
        profile = await self.get_owned_or_raise(bot_profile_id, owner)
        if profile.is_deleted:
            return

        remate_ids = await self._selection_repository.list_remate_ids_for_bot(bot_profile_id)
        for remate_id in remate_ids:
            run = await self._run_repository.get_by_remate_id(remate_id)
            if run is not None and run.status != BotSimulationStatus.STOPPED:
                raise BusinessRuleError(
                    "No se puede eliminar un bot que participa en una simulación activa; "
                    "detené la simulación primero."
                )

        profile.deleted_at = datetime.now(UTC)
        await self._repository.commit()


class BotSimulationService:
    def __init__(
        self,
        db: AsyncSession,
        selection_repository: BotRemateSelectionRepository,
        run_repository: BotSimulationRunRepository,
        profile_repository: BotProfileRepository,
        remate_service: RemateService,
        runner_registry: BotRunnerRegistry,
        event_bus: EventBus,
    ) -> None:
        self._db = db
        self._selection_repository = selection_repository
        self._run_repository = run_repository
        self._profile_repository = profile_repository
        self._remate_service = remate_service
        self._runner_registry = runner_registry
        self._event_bus = event_bus

    async def get_roster(self, remate_id: uuid.UUID, actor: User) -> list[BotRosterEntry]:
        # `get_operator_or_raise` (no `get_owned_or_raise`): admite tanto a la empresa
        # dueña como al rematador asignado como operador (ADR-048) -- pedido explícito
        # para que el rematador pueda armar y correr sus propios simuladores al
        # gestionar un remate en vivo, mientras este módulo exista.
        await self._remate_service.get_operator_or_raise(remate_id, actor)
        roster = await self._selection_repository.list_roster(remate_id)
        return [
            BotRosterEntry(
                bot_profile_id=selection.bot_profile_id,
                user_id=bot_profile.user_id,
                display_name=bot_profile.display_name,
                is_enabled=selection.is_enabled,
            )
            for selection, bot_profile in roster
        ]

    async def set_selection(
        self, remate_id: uuid.UUID, actor: User, bot_profile_ids: list[uuid.UUID]
    ) -> None:
        await self._remate_service.get_operator_or_raise(remate_id, actor)

        run = await self._run_repository.get_by_remate_id(remate_id)
        if run is not None and run.status != BotSimulationStatus.STOPPED:
            raise BusinessRuleError(
                "No se puede cambiar la selección de bots mientras la simulación está "
                "corriendo o pausada; detenéla primero."
            )

        for bot_profile_id in bot_profile_ids:
            profile = await self._profile_repository.get_by_id(bot_profile_id)
            if profile is None or (
                actor.role != UserRole.ADMIN and profile.created_by_id != actor.id
            ):
                raise NotFoundError("Bot no encontrado.")

        await self._selection_repository.replace_selection(remate_id, bot_profile_ids)
        await self._selection_repository.commit()

    async def get_run(self, remate_id: uuid.UUID, actor: User) -> BotSimulationRun | None:
        await self._remate_service.get_operator_or_raise(remate_id, actor)
        return await self._run_repository.get_by_remate_id(remate_id)

    async def start(self, remate_id: uuid.UUID, actor: User) -> BotSimulationRun:
        await self._remate_service.get_operator_or_raise(remate_id, actor)
        run = await self._get_or_create_run_for_update(remate_id)

        if run.status == BotSimulationStatus.RUNNING:
            return run  # idempotente

        run.status = BotSimulationStatus.RUNNING
        run.started_at = datetime.now(UTC)
        run.started_by_id = actor.id
        run.stop_reason = None
        await self._run_repository.commit()
        await self._run_repository.refresh(run)

        active_lote_id = await self._get_open_lote_id(remate_id)
        await self._runner_registry.start(remate_id, active_lote_id)
        await self._event_bus.publish(BotSimulationStarted(remate_id=remate_id))
        return run

    async def pause(self, remate_id: uuid.UUID, actor: User) -> BotSimulationRun:
        await self._remate_service.get_operator_or_raise(remate_id, actor)
        run = await self._run_repository.get_by_remate_id_for_update(remate_id)
        if run is None:
            raise NotFoundError("La simulación de este remate todavía no fue iniciada.")
        if run.status != BotSimulationStatus.RUNNING:
            return run  # idempotente (ya pausada o detenida)

        run.status = BotSimulationStatus.PAUSED
        run.paused_at = datetime.now(UTC)
        await self._run_repository.commit()
        await self._run_repository.refresh(run)

        await self._runner_registry.pause(remate_id)
        await self._event_bus.publish(BotSimulationPaused(remate_id=remate_id))
        return run

    async def stop(self, remate_id: uuid.UUID, actor: User) -> BotSimulationRun:
        await self._remate_service.get_operator_or_raise(remate_id, actor)
        run = await self._run_repository.get_by_remate_id_for_update(remate_id)
        if run is None:
            raise NotFoundError("La simulación de este remate todavía no fue iniciada.")
        if run.status == BotSimulationStatus.STOPPED:
            return run  # idempotente

        run.status = BotSimulationStatus.STOPPED
        run.stopped_at = datetime.now(UTC)
        run.stop_reason = "manual"
        await self._run_repository.commit()
        await self._run_repository.refresh(run)

        await self._runner_registry.stop(remate_id)
        await self._event_bus.publish(BotSimulationStopped(remate_id=remate_id, reason="manual"))
        return run

    async def _get_or_create_run_for_update(self, remate_id: uuid.UUID) -> BotSimulationRun:
        run = await self._run_repository.get_by_remate_id_for_update(remate_id)
        if run is not None:
            return run
        run = BotSimulationRun(remate_id=remate_id, status=BotSimulationStatus.STOPPED)
        self._run_repository.add(run)
        try:
            await self._run_repository.commit()
        except IntegrityError:
            # Dos "Iniciar" concurrentes sobre el mismo remate: el segundo pierde la
            # carrera de creación (UNIQUE sobre remate_id) -- se recupera la fila que
            # sí se creó, ya bloqueada por el `SELECT ... FOR UPDATE` de abajo.
            await self._run_repository.rollback()
        locked = await self._run_repository.get_by_remate_id_for_update(remate_id)
        assert locked is not None
        return locked

    async def _get_open_lote_id(self, remate_id: uuid.UUID) -> uuid.UUID | None:
        """Consulta nueva y deliberada, mismo criterio que
        `SnapshotService._get_open_lote` (no existe un `get_open_lote` reusable en
        `LoteRepository`) -- si ya hay un lote `OPEN` al iniciar, la simulación siembra
        reacciones de inmediato en vez de esperar el próximo `lote.opened`."""
        stmt = (
            select(Lote.id)
            .where(
                Lote.remate_id == remate_id,
                Lote.status == LoteStatus.OPEN,
                Lote.deleted_at.is_(None),
            )
            .limit(1)
        )
        return (await self._db.execute(stmt)).scalar_one_or_none()
