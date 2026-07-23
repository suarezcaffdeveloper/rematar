"""Acceso a datos de `Notification` (Épica 7, Módulo 7.5). Ver
docs/41-gestion-post-remate.md y ADR-044.

`create()` es síncrono y no comitea -- mismo criterio que `AuditLogRepository.record()`:
se llama justo antes del `commit()` que ya ejecuta el servicio de dominio que la dispara,
para que quede en la misma transacción (nunca se pierde, no depende del Event Bus
best-effort).
"""

import uuid
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.notifications.models import Notification


class NotificationRepository:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    def create(
        self,
        *,
        user_id: uuid.UUID,
        type: str,
        title: str,
        message: str,
        resource_type: str | None = None,
        resource_id: uuid.UUID | None = None,
        remate_id: uuid.UUID | None = None,
    ) -> Notification:
        notification = Notification(
            user_id=user_id,
            type=type,
            title=title,
            message=message,
            resource_type=resource_type,
            resource_id=resource_id,
            remate_id=remate_id,
        )
        self._db.add(notification)
        return notification

    async def get_by_id(self, notification_id: uuid.UUID) -> Notification | None:
        return await self._db.get(Notification, notification_id)

    async def list_for_user(
        self, user_id: uuid.UUID, *, unread_only: bool, offset: int, limit: int
    ) -> tuple[list[Notification], int]:
        stmt = select(Notification).where(Notification.user_id == user_id)
        if unread_only:
            stmt = stmt.where(Notification.read_at.is_(None))

        total = (
            await self._db.execute(select(func.count()).select_from(stmt.subquery()))
        ).scalar_one()

        stmt = stmt.order_by(Notification.created_at.desc()).offset(offset).limit(limit)
        items = (await self._db.execute(stmt)).scalars().all()
        return list(items), total

    async def count_unread(self, user_id: uuid.UUID) -> int:
        stmt = select(func.count()).select_from(Notification).where(
            Notification.user_id == user_id, Notification.read_at.is_(None)
        )
        return (await self._db.execute(stmt)).scalar_one()

    async def mark_read(
        self, notification_id: uuid.UUID, user_id: uuid.UUID
    ) -> Notification | None:
        notification = await self.get_by_id(notification_id)
        if notification is None or notification.user_id != user_id:
            return None
        if notification.read_at is None:
            notification.read_at = datetime.now(UTC)
        return notification

    async def mark_all_read(self, user_id: uuid.UUID) -> None:
        stmt = select(Notification).where(
            Notification.user_id == user_id, Notification.read_at.is_(None)
        )
        items = (await self._db.execute(stmt)).scalars().all()
        now = datetime.now(UTC)
        for notification in items:
            notification.read_at = now

    async def commit(self) -> None:
        await self._db.commit()

    async def refresh(self, notification: Notification) -> None:
        await self._db.refresh(notification)
