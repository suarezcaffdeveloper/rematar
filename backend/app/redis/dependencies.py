"""Dependencias de FastAPI del cliente Redis y sus capas de infraestructura.

`get_redis_client` devuelve siempre la **misma** instancia (creada una vez en el
`lifespan` de `app/main.py`, guardada en `app.state.redis`) — nunca una nueva por
request, a diferencia de `get_db`. Ver docs/18-integracion-redis.md.
"""

from typing import Annotated

from fastapi import Depends, Request
from redis.asyncio import Redis

from app.redis.cache import RedisCache
from app.redis.locks import RedisLockFactory
from app.redis.pubsub import RedisPubSub
from app.redis.streams import RedisStreams


def get_redis_client(request: Request) -> Redis:
    return request.app.state.redis


def get_cache(client: Annotated[Redis, Depends(get_redis_client)]) -> RedisCache:
    return RedisCache(client)


def get_pubsub(client: Annotated[Redis, Depends(get_redis_client)]) -> RedisPubSub:
    return RedisPubSub(client)


def get_streams(client: Annotated[Redis, Depends(get_redis_client)]) -> RedisStreams:
    return RedisStreams(client)


def get_lock_factory(client: Annotated[Redis, Depends(get_redis_client)]) -> RedisLockFactory:
    return RedisLockFactory(client)
