from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.notifications.repository import NotificationRepository


def get_notification_repository(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> NotificationRepository:
    return NotificationRepository(db)
