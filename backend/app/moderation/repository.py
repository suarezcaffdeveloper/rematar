"""Acceso a datos Postgres del Moderation Service (Épica 7, Módulo 7.6). Ver
docs/42-moderacion-en-tiempo-real.md y ADR-045.

`is_banned` es la superficie que `app/websocket/router.py` necesita en `_handle_join_room`
-- una consulta pura, sin lógica de negocio, mismo criterio que domain modules importan
`app.audit.repository` en vez de `app.audit.service`.

`get_users_by_ids` duplica el patrón de `HistoryRepository.get_users_by_ids`
(`app/history/repository.py`) en vez de extender `UserRepository` -- mismo criterio ya
aceptado en el proyecto: cada compositor de lectura resuelve nombres con su propia
consulta puntual, sin tocar el repositorio de usuarios.
"""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.moderation.models import ModerationPinnedMessage, RemateBan
from app.modules.users.models import User


class ModerationRepository:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    # --- Bans -------------------------------------------------------------------------

    async def is_banned(self, remate_id: uuid.UUID, user_id: uuid.UUID) -> bool:
        stmt = select(RemateBan.id).where(
            RemateBan.remate_id == remate_id, RemateBan.user_id == user_id
        )
        return (await self._db.execute(stmt)).scalar_one_or_none() is not None

    async def get_ban(self, remate_id: uuid.UUID, user_id: uuid.UUID) -> RemateBan | None:
        stmt = select(RemateBan).where(
            RemateBan.remate_id == remate_id, RemateBan.user_id == user_id
        )
        return (await self._db.execute(stmt)).scalar_one_or_none()

    def add_ban(self, ban: RemateBan) -> None:
        self._db.add(ban)

    # --- Mensajes destacados ------------------------------------------------------------

    async def get_pin(self, message_id: uuid.UUID) -> ModerationPinnedMessage | None:
        stmt = select(ModerationPinnedMessage).where(
            ModerationPinnedMessage.message_id == message_id
        )
        return (await self._db.execute(stmt)).scalar_one_or_none()

    def add_pin(self, pin: ModerationPinnedMessage) -> None:
        self._db.add(pin)

    async def remove_pin(self, pin: ModerationPinnedMessage) -> None:
        await self._db.delete(pin)

    async def list_pinned(self, remate_id: uuid.UUID) -> list[ModerationPinnedMessage]:
        stmt = (
            select(ModerationPinnedMessage)
            .where(ModerationPinnedMessage.remate_id == remate_id)
            .order_by(ModerationPinnedMessage.pinned_at.asc())
        )
        return list((await self._db.execute(stmt)).scalars().all())

    # --- Usuarios (solo lectura, para resolver nombres) --------------------------------

    async def get_users_by_ids(self, user_ids: set[uuid.UUID]) -> dict[uuid.UUID, User]:
        if not user_ids:
            return {}
        stmt = select(User).where(User.id.in_(user_ids))
        rows = (await self._db.execute(stmt)).scalars().all()
        return {user.id: user for user in rows}

    # --- Transacción ---------------------------------------------------------------------

    async def flush(self) -> None:
        await self._db.flush()

    async def commit(self) -> None:
        await self._db.commit()

    async def refresh(self, instance: RemateBan | ModerationPinnedMessage) -> None:
        await self._db.refresh(instance)
