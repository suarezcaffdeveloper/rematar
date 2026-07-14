"""Acceso a datos del módulo de lotes.

A diferencia de `RemateRepository.list_for_viewer` (que codifica reglas de visibilidad en
SQL), acá la visibilidad se resuelve en `LoteService` a partir del `Remate` padre —
`list_by_remate` simplemente lista los lotes vivos de un remate ya autorizado.
"""

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.remates.lotes.models import Lote, LoteStatus


class LoteRepository:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def get_by_id(self, lote_id: uuid.UUID) -> Lote | None:
        lote = await self._db.get(Lote, lote_id)
        if lote is not None and lote.deleted_at is not None:
            return None
        return lote

    async def list_by_remate(
        self, *, remate_id: uuid.UUID, offset: int, limit: int
    ) -> tuple[list[Lote], int]:
        stmt = select(Lote).where(Lote.remate_id == remate_id, Lote.deleted_at.is_(None))

        total = (
            await self._db.execute(select(func.count()).select_from(stmt.subquery()))
        ).scalar_one()

        stmt = stmt.order_by(Lote.display_order.asc()).offset(offset).limit(limit)
        items = (await self._db.execute(stmt)).scalars().all()
        return list(items), total

    async def list_all_by_remate(self, remate_id: uuid.UUID) -> list[Lote]:
        """Todos los lotes vivos de un remate, sin paginar — usado por `reorder`, que
        necesita el conjunto completo para validar y reescribir `display_order`."""
        stmt = select(Lote).where(Lote.remate_id == remate_id, Lote.deleted_at.is_(None))
        return list((await self._db.execute(stmt)).scalars().all())

    async def next_display_order(self, remate_id: uuid.UUID) -> int:
        stmt = select(func.coalesce(func.max(Lote.display_order), -1) + 1).where(
            Lote.remate_id == remate_id, Lote.deleted_at.is_(None)
        )
        return (await self._db.execute(stmt)).scalar_one()

    async def count_by_remate(self, remate_id: uuid.UUID) -> int:
        """Usado por `RemateService.start` para validar RF-08 (al menos un lote
        cargado) — cuenta cualquier lote vivo, sin importar su estado."""
        stmt = select(func.count()).select_from(Lote).where(
            Lote.remate_id == remate_id, Lote.deleted_at.is_(None)
        )
        return (await self._db.execute(stmt)).scalar_one()

    async def has_open_lote(self, remate_id: uuid.UUID) -> bool:
        """RF-12: usado antes de abrir un lote (no puede haber otro ya OPEN) y antes de
        finalizar el remate (no puede haber ninguno OPEN)."""
        stmt = select(func.count()).select_from(Lote).where(
            Lote.remate_id == remate_id,
            Lote.status == LoteStatus.OPEN,
            Lote.deleted_at.is_(None),
        )
        return (await self._db.execute(stmt)).scalar_one() > 0

    async def has_unresolved_lote(self, remate_id: uuid.UUID) -> bool:
        """RF-10: usado por `RemateService.try_auto_finish` — si no queda ningún lote
        PENDING ni OPEN, el remate puede finalizarse solo."""
        stmt = select(func.count()).select_from(Lote).where(
            Lote.remate_id == remate_id,
            Lote.status.in_((LoteStatus.PENDING, LoteStatus.OPEN)),
            Lote.deleted_at.is_(None),
        )
        return (await self._db.execute(stmt)).scalar_one() > 0

    async def get_next_pending_lote(self, remate_id: uuid.UUID) -> Lote | None:
        """RF-13: el `PENDING` de menor `display_order`, para `LoteService.open_next`."""
        stmt = (
            select(Lote)
            .where(
                Lote.remate_id == remate_id,
                Lote.status == LoteStatus.PENDING,
                Lote.deleted_at.is_(None),
            )
            .order_by(Lote.display_order.asc())
            .limit(1)
        )
        return (await self._db.execute(stmt)).scalar_one_or_none()

    def add(self, lote: Lote) -> None:
        self._db.add(lote)

    async def commit(self) -> None:
        await self._db.commit()

    async def rollback(self) -> None:
        await self._db.rollback()

    async def refresh(self, lote: Lote) -> None:
        await self._db.refresh(lote)
