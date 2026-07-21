from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit.repository import AuditLogRepository
from app.core.config import Settings, get_settings
from app.db.session import get_db
from app.events.bus import EventBus
from app.events.dependencies import get_event_bus
from app.modules.chat.repository import ChatMessageRepository
from app.modules.chat.service import ChatService
from app.modules.remates.dependencies import get_remate_service
from app.modules.remates.service import RemateService
from app.redis.dependencies import get_rate_limiter
from app.redis.rate_limit import RedisRateLimiter


def get_chat_message_repository(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ChatMessageRepository:
    return ChatMessageRepository(db)


def get_chat_service(
    repository: Annotated[ChatMessageRepository, Depends(get_chat_message_repository)],
    remate_service: Annotated[RemateService, Depends(get_remate_service)],
    event_bus: Annotated[EventBus, Depends(get_event_bus)],
    rate_limiter: Annotated[RedisRateLimiter, Depends(get_rate_limiter)],
    settings: Annotated[Settings, Depends(get_settings)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ChatService:
    return ChatService(repository, remate_service, event_bus, rate_limiter, settings, AuditLogRepository(db))
