"""Dependencias de FastAPI del Moderation Service (Épica 7, Módulo 7.6). Ver
docs/42-moderacion-en-tiempo-real.md y ADR-045.

Mismo patrón `HTTPConnection` que `app/presence/dependencies.py`/
`app/snapshot/dependencies.py`: `get_moderation_service` funciona tanto desde un
endpoint HTTP (`router.py`) como desde el Gateway WebSocket (`app/websocket/router.py`).
Los helpers privados (`_get_connection_manager`/`_get_room_manager`/`_get_event_bus`/
`_get_remate_service`) se duplican a propósito -- mismo criterio ya aceptado en esos dos
archivos.

`get_moderation_repository`/`get_moderation_redis_gateway` son las superficies livianas
que `app/websocket/router.py` (repository, chequeo de ban) y
`app/modules/chat/router.py` (redis_state, chequeo de mute/lock) importan directamente
-- nunca `get_moderation_service`, que compone mucho más.
"""

from typing import Annotated

from fastapi import Depends
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.requests import HTTPConnection

from app.audit.repository import AuditLogRepository
from app.core.config import Settings, get_settings
from app.db.session import get_db
from app.events.bus import EventBus
from app.events.redis_bus import RedisEventBus
from app.moderation.redis_state import ModerationRedisGateway
from app.moderation.repository import ModerationRepository
from app.moderation.service import ModerationService
from app.modules.chat.dependencies import get_chat_message_repository
from app.modules.chat.repository import ChatMessageRepository
from app.modules.remates.lotes.repository import LoteRepository
from app.modules.remates.repository import RemateRepository
from app.modules.remates.service import RemateService
from app.modules.users.dependencies import get_user_repository
from app.modules.users.repository import UserRepository
from app.notifications.dependencies import get_notification_repository
from app.notifications.repository import NotificationRepository
from app.presence.dependencies import get_presence_service
from app.presence.service import PresenceService
from app.redis.pubsub import RedisPubSub
from app.websocket.manager import ConnectionManager
from app.websocket.rooms import RoomManager


def _get_redis_client(connection: HTTPConnection) -> Redis:
    return connection.app.state.redis


def _get_connection_manager(connection: HTTPConnection) -> ConnectionManager:
    return connection.app.state.connection_manager


def _get_room_manager(connection: HTTPConnection) -> RoomManager:
    return connection.app.state.room_manager


def _get_event_bus(connection: HTTPConnection) -> EventBus:
    return RedisEventBus(RedisPubSub(connection.app.state.redis))


def _get_remate_repository(db: Annotated[AsyncSession, Depends(get_db)]) -> RemateRepository:
    return RemateRepository(db)


def _get_remate_service(
    remate_repository: Annotated[RemateRepository, Depends(_get_remate_repository)],
    db: Annotated[AsyncSession, Depends(get_db)],
    event_bus: Annotated[EventBus, Depends(_get_event_bus)],
) -> RemateService:
    return RemateService(remate_repository, LoteRepository(db), event_bus, AuditLogRepository(db))


def get_moderation_repository(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ModerationRepository:
    return ModerationRepository(db)


def get_moderation_redis_gateway(
    client: Annotated[Redis, Depends(_get_redis_client)],
) -> ModerationRedisGateway:
    return ModerationRedisGateway(client)


def get_moderation_service(
    repository: Annotated[ModerationRepository, Depends(get_moderation_repository)],
    redis_gateway: Annotated[ModerationRedisGateway, Depends(get_moderation_redis_gateway)],
    connection_manager: Annotated[ConnectionManager, Depends(_get_connection_manager)],
    room_manager: Annotated[RoomManager, Depends(_get_room_manager)],
    presence_service: Annotated[PresenceService, Depends(get_presence_service)],
    remate_service: Annotated[RemateService, Depends(_get_remate_service)],
    remate_repository: Annotated[RemateRepository, Depends(_get_remate_repository)],
    chat_message_repository: Annotated[
        ChatMessageRepository, Depends(get_chat_message_repository)
    ],
    user_repository: Annotated[UserRepository, Depends(get_user_repository)],
    notification_repository: Annotated[
        NotificationRepository, Depends(get_notification_repository)
    ],
    event_bus: Annotated[EventBus, Depends(_get_event_bus)],
    settings: Annotated[Settings, Depends(get_settings)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ModerationService:
    return ModerationService(
        repository,
        redis_gateway,
        connection_manager,
        room_manager,
        presence_service,
        remate_service,
        remate_repository,
        chat_message_repository,
        user_repository,
        AuditLogRepository(db),
        notification_repository,
        event_bus,
        settings,
    )
