import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth.models import RefreshToken


class RefreshTokenRepository:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def get_by_id(self, token_id: uuid.UUID) -> RefreshToken | None:
        return await self._db.get(RefreshToken, token_id)

    def add(self, token: RefreshToken) -> None:
        self._db.add(token)

    async def commit(self) -> None:
        await self._db.commit()

    async def refresh(self, token: RefreshToken) -> None:
        await self._db.refresh(token)
