"""Dependencia de FastAPI del `PresenceService`. Ver docs/33-sistema-de-presencia.md.

Mismo patrón que `app/snapshot/dependencies.py` (ADR-026, sección F): usa
`starlette.requests.HTTPConnection` (clase base común de `Request` y `WebSocket`) para
que `get_presence_service` funcione tanto desde un endpoint HTTP (`app/presence/router.py`,
`app/snapshot/router.py`) como desde el Gateway WebSocket (`app/websocket/router.py`).
`app/websocket/dependencies.py::get_connection_manager`/`get_room_manager` no sirven acá
tal cual porque toman `websocket: WebSocket` específicamente -- se duplican como
funciones privadas, mismo criterio ya aceptado por `_get_cache`/`_get_event_bus` en
`app/snapshot/dependencies.py`.
"""

from typing import Annotated

from fastapi import Depends
from starlette.requests import HTTPConnection

from app.events.bus import EventBus
from app.events.redis_bus import RedisEventBus
from app.presence.service import PresenceService
from app.redis.pubsub import RedisPubSub
from app.websocket.manager import ConnectionManager
from app.websocket.rooms import RoomManager


def _get_room_manager(connection: HTTPConnection) -> RoomManager:
    return connection.app.state.room_manager


def _get_connection_manager(connection: HTTPConnection) -> ConnectionManager:
    return connection.app.state.connection_manager


def _get_event_bus(connection: HTTPConnection) -> EventBus:
    return RedisEventBus(RedisPubSub(connection.app.state.redis))


def get_presence_service(
    room_manager: Annotated[RoomManager, Depends(_get_room_manager)],
    connection_manager: Annotated[ConnectionManager, Depends(_get_connection_manager)],
    event_bus: Annotated[EventBus, Depends(_get_event_bus)],
) -> PresenceService:
    return PresenceService(room_manager, connection_manager, event_bus)
