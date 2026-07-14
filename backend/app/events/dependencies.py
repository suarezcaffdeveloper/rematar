"""Dependencia de FastAPI del Event Bus. Ver docs/19-arquitectura-de-eventos.md."""

from typing import Annotated

from fastapi import Depends

from app.events.bus import EventBus
from app.events.redis_bus import RedisEventBus
from app.redis.dependencies import get_pubsub
from app.redis.pubsub import RedisPubSub


def get_event_bus(pubsub: Annotated[RedisPubSub, Depends(get_pubsub)]) -> EventBus:
    return RedisEventBus(pubsub)
