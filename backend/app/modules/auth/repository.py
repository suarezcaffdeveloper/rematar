import uuid
from datetime import UTC, datetime

from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.auth.models import PasswordResetToken, RefreshToken


class RefreshTokenRepository:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def get_by_id(self, token_id: uuid.UUID) -> RefreshToken | None:
        return await self._db.get(RefreshToken, token_id)

    def add(self, token: RefreshToken) -> None:
        self._db.add(token)

    async def revoke_all_for_user(self, user_id: uuid.UUID) -> None:
        """Cierra todas las sesiones activas de un usuario -- se usa al resetear la
        contraseña (RNF-11): si alguien más quedó logueado con la contraseña vieja
        (por ejemplo, quien la comprometió), esto lo saca. No commitea: queda en la
        misma transacción que el resto del flujo de reset (ver `AuthService.reset_password`)."""
        await self._db.execute(
            update(RefreshToken)
            .where(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None))
            .values(revoked_at=datetime.now(UTC))
        )

    async def commit(self) -> None:
        await self._db.commit()

    async def refresh(self, token: RefreshToken) -> None:
        await self._db.refresh(token)


class PasswordResetTokenRepository:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def get_by_id(self, token_id: uuid.UUID) -> PasswordResetToken | None:
        return await self._db.get(PasswordResetToken, token_id)

    def add(self, token: PasswordResetToken) -> None:
        self._db.add(token)

    async def invalidate_all_for_user(self, user_id: uuid.UUID) -> None:
        """Marca como usado cualquier link de recuperación vigente de este usuario --
        se llama antes de emitir uno nuevo (`AuthService.request_password_reset`), para
        que pedir un link nuevo invalide silenciosamente los anteriores en vez de dejar
        varios links válidos circulando a la vez. No commitea, mismo criterio que
        `RefreshTokenRepository.revoke_all_for_user`."""
        await self._db.execute(
            update(PasswordResetToken)
            .where(PasswordResetToken.user_id == user_id, PasswordResetToken.used_at.is_(None))
            .values(used_at=datetime.now(UTC))
        )

    async def commit(self) -> None:
        await self._db.commit()

    async def refresh(self, token: PasswordResetToken) -> None:
        await self._db.refresh(token)
