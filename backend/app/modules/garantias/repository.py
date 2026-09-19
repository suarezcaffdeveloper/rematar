"""Acceso a datos de la Garantía Económica -- mismo boilerplate que
`app/postauction/repository.py`."""

import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.garantias.models import Garantia, GarantiaEvent, GarantiaStatus


class GarantiaRepository:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    def add(self, garantia: Garantia) -> None:
        self._db.add(garantia)

    async def get_by_id(self, garantia_id: uuid.UUID) -> Garantia | None:
        return await self._db.get(Garantia, garantia_id)

    async def get_by_remate_and_buyer(
        self, remate_id: uuid.UUID, buyer_id: uuid.UUID
    ) -> Garantia | None:
        stmt = select(Garantia).where(
            Garantia.remate_id == remate_id, Garantia.buyer_id == buyer_id
        )
        return (await self._db.execute(stmt)).scalar_one_or_none()

    async def get_by_mp_payment_id(self, mp_payment_id: str) -> Garantia | None:
        stmt = select(Garantia).where(Garantia.mp_payment_id == mp_payment_id)
        return (await self._db.execute(stmt)).scalar_one_or_none()

    async def list_active_by_remate(self, remate_id: uuid.UUID) -> list[Garantia]:
        stmt = select(Garantia).where(
            Garantia.remate_id == remate_id, Garantia.status == GarantiaStatus.ACTIVE
        )
        return list((await self._db.execute(stmt)).scalars().all())

    async def list_active_expiring_before(self, threshold: datetime) -> list[Garantia]:
        stmt = select(Garantia).where(
            Garantia.status == GarantiaStatus.ACTIVE, Garantia.expires_at < threshold
        )
        return list((await self._db.execute(stmt)).scalars().all())

    def add_event(self, event: GarantiaEvent) -> None:
        self._db.add(event)

    async def list_events(self, garantia_id: uuid.UUID) -> list[GarantiaEvent]:
        stmt = (
            select(GarantiaEvent)
            .where(GarantiaEvent.garantia_id == garantia_id)
            .order_by(GarantiaEvent.occurred_at.asc())
        )
        return list((await self._db.execute(stmt)).scalars().all())

    async def flush(self) -> None:
        await self._db.flush()

    async def rollback(self) -> None:
        await self._db.rollback()

    async def commit(self) -> None:
        await self._db.commit()

    async def refresh(self, garantia: Garantia) -> None:
        await self._db.refresh(garantia)
