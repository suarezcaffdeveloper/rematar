"""Acceso a datos del módulo de lotes.

A diferencia de `RemateRepository.list_for_viewer` (que codifica reglas de visibilidad en
SQL), acá la visibilidad se resuelve en `LoteService` a partir del `Remate` padre —
`list_by_remate` simplemente lista los lotes vivos de un remate ya autorizado.
"""

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.remates.lotes.models import Lote


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

    def add(self, lote: Lote) -> None:
        self._db.add(lote)

    async def commit(self) -> None:
        await self._db.commit()

    async def rollback(self) -> None:
        await self._db.rollback()

    async def refresh(self, lote: Lote) -> None:
        await self._db.refresh(lote)
