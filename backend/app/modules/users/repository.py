"""Acceso a datos del módulo de usuarios.

El repositorio encapsula exclusivamente cómo se lee/escribe `User` en la base — no
contiene reglas de negocio (esas viven en `service.py`). Esta separación es la que
permite testear `UserService` con un repositorio falso si algún día hiciera falta, sin
tocar SQLAlchemy, y es la misma razón por la que se documentó en
`docs/09-arquitectura-y-decisiones.md` como parte de la organización en capas.
"""

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.users.models import User


class UserRepository:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def get_by_id(self, user_id: uuid.UUID) -> User | None:
        return await self._db.get(User, user_id)

    async def get_by_email(self, email: str) -> User | None:
        result = await self._db.execute(select(User).where(User.email == email))
        return result.scalar_one_or_none()

    async def list_all(self, *, offset: int, limit: int) -> tuple[list[User], int]:
        items_result = await self._db.execute(
            select(User).order_by(User.created_at.desc()).offset(offset).limit(limit)
        )
        count_result = await self._db.execute(select(func.count()).select_from(User))
        total = count_result.scalar_one()
        return list(items_result.scalars().all()), total

    def add(self, user: User) -> None:
        self._db.add(user)

    async def commit(self) -> None:
        await self._db.commit()

    async def refresh(self, user: User) -> None:
        await self._db.refresh(user)
