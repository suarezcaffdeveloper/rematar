from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit.repository import AuditLogRepository
from app.db.session import get_db
from app.events.bus import EventBus
from app.events.dependencies import get_event_bus
from app.modules.remates.dependencies import get_remate_repository
from app.modules.remates.lotes.dependencies import get_lote_repository
from app.modules.remates.lotes.repository import LoteRepository
from app.modules.remates.repository import RemateRepository
from app.modules.users.dependencies import get_user_repository
from app.modules.users.repository import UserRepository
from app.notifications.dependencies import get_notification_repository
from app.notifications.repository import NotificationRepository
from app.postauction.repository import PostAuctionRepository
from app.postauction.service import PostAuctionService


def get_postauction_repository(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> PostAuctionRepository:
    return PostAuctionRepository(db)


def get_postauction_service(
    repository: Annotated[PostAuctionRepository, Depends(get_postauction_repository)],
    remate_repository: Annotated[RemateRepository, Depends(get_remate_repository)],
    lote_repository: Annotated[LoteRepository, Depends(get_lote_repository)],
    user_repository: Annotated[UserRepository, Depends(get_user_repository)],
    notification_repository: Annotated[
        NotificationRepository, Depends(get_notification_repository)
    ],
    event_bus: Annotated[EventBus, Depends(get_event_bus)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> PostAuctionService:
    return PostAuctionService(
        repository,
        remate_repository,
        lote_repository,
        user_repository,
        AuditLogRepository(db),
        notification_repository,
        event_bus,
    )
