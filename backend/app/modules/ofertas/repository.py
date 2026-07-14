"""Acceso a datos del módulo de ofertas.

`get_leading_offer` se apoya en el invariante de `Oferta.__table_args__` (a lo sumo una
`ACCEPTED` por lote) — filtra por estado, no calcula un `MAX(amount)`, ver
docs/adr/ADR-020-diseno-del-auction-engine.md, sección B.
"""

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.ofertas.models import Oferta, OfertaStatus


class OfertaRepository:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def get_by_buyer_and_token(
        self, buyer_id: uuid.UUID, client_token: str
    ) -> Oferta | None:
        stmt = select(Oferta).where(
            Oferta.buyer_id == buyer_id, Oferta.client_token == client_token
        )
        return (await self._db.execute(stmt)).scalar_one_or_none()

    async def get_leading_offer(self, lote_id: uuid.UUID) -> Oferta | None:
        stmt = select(Oferta).where(
            Oferta.lote_id == lote_id, Oferta.status == OfertaStatus.ACCEPTED
        )
        return (await self._db.execute(stmt)).scalar_one_or_none()

    async def list_by_lote(
        self, *, lote_id: uuid.UUID, offset: int, limit: int
    ) -> tuple[list[Oferta], int]:
        stmt = select(Oferta).where(Oferta.lote_id == lote_id)

        total = (
            await self._db.execute(select(func.count()).select_from(stmt.subquery()))
        ).scalar_one()

        stmt = stmt.order_by(Oferta.created_at.desc()).offset(offset).limit(limit)
        items = (await self._db.execute(stmt)).scalars().all()
        return list(items), total

    def add(self, oferta: Oferta) -> None:
        self._db.add(oferta)

    async def commit(self) -> None:
        await self._db.commit()

    async def rollback(self) -> None:
        await self._db.rollback()

    async def refresh(self, oferta: Oferta) -> None:
        await self._db.refresh(oferta)
