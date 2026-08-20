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
        self, buyer_id: uuid.UUID, client_token: str, *, lote_id: uuid.UUID
    ) -> Oferta | None:
        """Fase 9 de remediación del WebSocket Security Audit (Auction Business Logic
        Security): filtra también por `lote_id`, aunque el índice único de la base
        (`uq_ofertas_buyer_id_client_token`, `models.py`) sea sobre `(buyer_id,
        client_token)` sin `lote_id` -- un cambio de índice implicaría una migración,
        fuera del alcance mínimo de este fix. Sin este filtro, un `client_token`
        reusado por error (o a propósito) para ofertar en un lote B distinto del lote A
        donde se usó por primera vez encontraba igual la fila de A y la devolvía como
        si fuera el resultado de ofertar en B -- el comprador se iba pensando que
        ofertó en B sin que se hubiera registrado nada ahí. Con el filtro, ese caso ya
        no "encuentra" la fila de A (ver `AuctionEngine.place_bid`/`_save`, que ahora
        traducen el conflicto resultante del índice único en un error claro en vez de
        una respuesta silenciosamente incorrecta)."""
        stmt = select(Oferta).where(
            Oferta.buyer_id == buyer_id,
            Oferta.client_token == client_token,
            Oferta.lote_id == lote_id,
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
