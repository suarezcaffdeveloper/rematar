"""Acceso a datos del módulo de bots simuladores de compradores."""

import uuid

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.bots.models import (
    BotProfile,
    BotRemateSelection,
    BotSimulationRun,
    BotSimulationStatus,
)


class BotProfileRepository:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    def add(self, profile: BotProfile) -> None:
        self._db.add(profile)

    async def commit(self) -> None:
        await self._db.commit()

    async def rollback(self) -> None:
        await self._db.rollback()

    async def refresh(self, profile: BotProfile) -> None:
        await self._db.refresh(profile)

    async def get_by_id(self, bot_profile_id: uuid.UUID) -> BotProfile | None:
        profile = await self._db.get(BotProfile, bot_profile_id)
        if profile is not None and profile.deleted_at is not None:
            return None
        return profile

    async def list_by_owner(self, owner_id: uuid.UUID) -> list[BotProfile]:
        stmt = (
            select(BotProfile)
            .where(BotProfile.created_by_id == owner_id, BotProfile.deleted_at.is_(None))
            .order_by(BotProfile.created_at.desc())
        )
        return list((await self._db.execute(stmt)).scalars().all())

    async def list_all(self) -> list[BotProfile]:
        stmt = (
            select(BotProfile)
            .where(BotProfile.deleted_at.is_(None))
            .order_by(BotProfile.created_at.desc())
        )
        return list((await self._db.execute(stmt)).scalars().all())


class BotRemateSelectionRepository:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def list_by_remate(self, remate_id: uuid.UUID) -> list[BotRemateSelection]:
        stmt = select(BotRemateSelection).where(BotRemateSelection.remate_id == remate_id)
        return list((await self._db.execute(stmt)).scalars().all())

    async def list_roster(
        self, remate_id: uuid.UUID
    ) -> list[tuple[BotRemateSelection, BotProfile]]:
        """Selección + perfil en una sola consulta -- lo que necesita el frontend para
        el checklist y para resolver `is_bot` en la consola del rematador. Filtra
        perfiles borrados (soft-delete) para no ofrecer un bot inexistente."""
        stmt = (
            select(BotRemateSelection, BotProfile)
            .join(BotProfile, BotProfile.id == BotRemateSelection.bot_profile_id)
            .where(BotRemateSelection.remate_id == remate_id, BotProfile.deleted_at.is_(None))
        )
        return [(row[0], row[1]) for row in (await self._db.execute(stmt)).all()]

    async def list_remate_ids_for_bot(self, bot_profile_id: uuid.UUID) -> list[uuid.UUID]:
        stmt = select(BotRemateSelection.remate_id).where(
            BotRemateSelection.bot_profile_id == bot_profile_id
        )
        return list((await self._db.execute(stmt)).scalars().all())

    async def replace_selection(
        self, remate_id: uuid.UUID, bot_profile_ids: list[uuid.UUID]
    ) -> None:
        """Reemplaza el set completo de bots seleccionados para un remate -- borra las
        filas que ya no corresponden, agrega las nuevas, conserva (sin tocar
        `is_enabled`) las que siguen presentes en ambos conjuntos."""
        existing = {sel.bot_profile_id: sel for sel in await self.list_by_remate(remate_id)}
        wanted = set(bot_profile_ids)
        for bot_profile_id, selection in existing.items():
            if bot_profile_id not in wanted:
                await self._db.delete(selection)
        for bot_profile_id in wanted:
            if bot_profile_id not in existing:
                self._db.add(
                    BotRemateSelection(
                        remate_id=remate_id, bot_profile_id=bot_profile_id, is_enabled=True
                    )
                )

    async def commit(self) -> None:
        await self._db.commit()


class BotSimulationRunRepository:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    def add(self, run: BotSimulationRun) -> None:
        self._db.add(run)

    async def commit(self) -> None:
        await self._db.commit()

    async def rollback(self) -> None:
        await self._db.rollback()

    async def refresh(self, run: BotSimulationRun) -> None:
        await self._db.refresh(run)

    async def get_by_remate_id(self, remate_id: uuid.UUID) -> BotSimulationRun | None:
        stmt = select(BotSimulationRun).where(BotSimulationRun.remate_id == remate_id)
        return (await self._db.execute(stmt)).scalar_one_or_none()

    async def get_by_remate_id_for_update(self, remate_id: uuid.UUID) -> BotSimulationRun | None:
        """`SELECT ... FOR UPDATE`, mismo criterio que `LoteRepository.get_by_id_for_update`
        (ADR-004) -- evita que dos llamadas concurrentes a Iniciar/Pausar/Detener sobre
        el mismo remate corran su lectura-modificación-escritura entrelazadas."""
        stmt = (
            select(BotSimulationRun)
            .where(BotSimulationRun.remate_id == remate_id)
            .with_for_update()
        )
        return (await self._db.execute(stmt)).scalar_one_or_none()

    async def reconcile_orphaned_runs(self) -> int:
        """Llamado una única vez al arrancar el proceso (`_lifespan`, antes de levantar
        el `BotEventConsumer`): cualquier fila `running`/`paused` que haya quedado de
        una instancia anterior no tiene ninguna tarea `asyncio` real detrás (el registro
        en memoria se perdió con el proceso) -- se marca `stopped` para que la UI nunca
        muestre una simulación fantasma. Devuelve cuántas filas se reconciliaron, solo
        para logging."""
        stmt = (
            update(BotSimulationRun)
            .where(
                BotSimulationRun.status.in_(
                    [BotSimulationStatus.RUNNING, BotSimulationStatus.PAUSED]
                )
            )
            .values(
                status=BotSimulationStatus.STOPPED,
                stopped_at=func.now(),
                stop_reason="process_restart",
            )
        )
        result = await self._db.execute(stmt)
        await self._db.commit()
        return result.rowcount or 0
