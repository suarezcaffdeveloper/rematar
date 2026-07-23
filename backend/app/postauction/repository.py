"""Acceso a datos del PostAuction Service (Épica 7, Módulo 7.5). Ver
docs/41-gestion-post-remate.md y ADR-044.

`list_for_rematador` hace join contra `Lote`/`User` (no relaciones ORM, mismo criterio de
"FK simple sin `relationship()`" que el resto del proyecto) únicamente para poder filtrar
por texto libre (número/título de lote, nombre del comprador) en SQL -- igual que
`RemateRepository.list_for_viewer` filtra en SQL, no en Python, por el mismo motivo de
paginación correcta a escala.
"""

import uuid

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.remates.lotes.models import Lote
from app.modules.users.models import User
from app.postauction.models import (
    PostAuctionCase,
    PostAuctionStatus,
    PostAuctionTimelineEntry,
)


class PostAuctionRepository:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    def add_case(self, case: PostAuctionCase) -> None:
        self._db.add(case)

    async def get_by_id(self, case_id: uuid.UUID) -> PostAuctionCase | None:
        return await self._db.get(PostAuctionCase, case_id)

    async def get_by_lote_id(self, lote_id: uuid.UUID) -> PostAuctionCase | None:
        stmt = select(PostAuctionCase).where(PostAuctionCase.lote_id == lote_id)
        return (await self._db.execute(stmt)).scalar_one_or_none()

    async def list_for_rematador(
        self,
        *,
        rematador_id: uuid.UUID,
        status: PostAuctionStatus | None,
        remate_id: uuid.UUID | None,
        search: str | None,
        offset: int,
        limit: int,
    ) -> tuple[list[PostAuctionCase], int]:
        stmt = (
            select(PostAuctionCase)
            .join(Lote, Lote.id == PostAuctionCase.lote_id)
            .join(User, User.id == PostAuctionCase.buyer_id)
            .where(PostAuctionCase.rematador_id == rematador_id)
        )
        if status is not None:
            stmt = stmt.where(PostAuctionCase.status == status)
        if remate_id is not None:
            stmt = stmt.where(PostAuctionCase.remate_id == remate_id)
        if search:
            pattern = f"%{search}%"
            stmt = stmt.where(
                or_(
                    Lote.title.ilike(pattern),
                    Lote.lot_number.ilike(pattern),
                    User.full_name.ilike(pattern),
                )
            )

        total = (
            await self._db.execute(select(func.count()).select_from(stmt.subquery()))
        ).scalar_one()

        stmt = stmt.order_by(PostAuctionCase.created_at.desc()).offset(offset).limit(limit)
        items = (await self._db.execute(stmt)).scalars().all()
        return list(items), total

    async def list_for_buyer(
        self, *, buyer_id: uuid.UUID, offset: int, limit: int
    ) -> tuple[list[PostAuctionCase], int]:
        stmt = select(PostAuctionCase).where(PostAuctionCase.buyer_id == buyer_id)

        total = (
            await self._db.execute(select(func.count()).select_from(stmt.subquery()))
        ).scalar_one()

        stmt = stmt.order_by(PostAuctionCase.created_at.desc()).offset(offset).limit(limit)
        items = (await self._db.execute(stmt)).scalars().all()
        return list(items), total

    def add_timeline_entry(self, entry: PostAuctionTimelineEntry) -> None:
        self._db.add(entry)

    async def list_timeline(self, case_id: uuid.UUID) -> list[PostAuctionTimelineEntry]:
        stmt = (
            select(PostAuctionTimelineEntry)
            .where(PostAuctionTimelineEntry.case_id == case_id)
            .order_by(PostAuctionTimelineEntry.occurred_at.asc())
        )
        return list((await self._db.execute(stmt)).scalars().all())

    async def flush(self) -> None:
        await self._db.flush()

    async def commit(self) -> None:
        await self._db.commit()

    async def refresh(self, case: PostAuctionCase) -> None:
        await self._db.refresh(case)
