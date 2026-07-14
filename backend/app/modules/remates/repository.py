"""Acceso a datos del módulo de remates.

`list_for_viewer` codifica la regla de visibilidad (docs/14-modulo-remate.md) como una
cláusula SQL, no como un filtro en Python después de traer todo: con la escala pensada en
Fase 0 (RNF-04, cientos/miles de remates eventualmente) filtrar en el cliente sería tanto
incorrecto para la paginación (`total` quedaría mal) como lento.
"""

import uuid

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.remates.models import Remate, RemateCategory, RemateStatus
from app.modules.users.models import User, UserRole


class RemateRepository:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def get_by_id(self, remate_id: uuid.UUID) -> Remate | None:
        remate = await self._db.get(Remate, remate_id)
        if remate is not None and remate.deleted_at is not None:
            return None
        return remate

    async def list_for_viewer(
        self,
        *,
        viewer: User,
        offset: int,
        limit: int,
        category: RemateCategory | None = None,
        status: RemateStatus | None = None,
        owner_id: uuid.UUID | None = None,
    ) -> tuple[list[Remate], int]:
        stmt = select(Remate).where(Remate.deleted_at.is_(None))

        if viewer.role != UserRole.ADMIN:
            # Ve sus propios remates en cualquier estado, y los de cualquiera mientras
            # no estén en borrador. Ver docs/14-modulo-remate.md, sección "Visibilidad".
            stmt = stmt.where(
                or_(Remate.owner_id == viewer.id, Remate.status != RemateStatus.DRAFT)
            )

        if category is not None:
            stmt = stmt.where(Remate.category == category)
        if status is not None:
            stmt = stmt.where(Remate.status == status)
        if owner_id is not None:
            stmt = stmt.where(Remate.owner_id == owner_id)

        total = (
            await self._db.execute(select(func.count()).select_from(stmt.subquery()))
        ).scalar_one()

        stmt = stmt.order_by(Remate.created_at.desc()).offset(offset).limit(limit)
        items = (await self._db.execute(stmt)).scalars().all()
        return list(items), total

    def add(self, remate: Remate) -> None:
        self._db.add(remate)

    async def commit(self) -> None:
        await self._db.commit()

    async def refresh(self, remate: Remate) -> None:
        await self._db.refresh(remate)
