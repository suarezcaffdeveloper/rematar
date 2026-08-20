"""Dependencias de FastAPI del cliente Redis y sus capas de infraestructura.

`get_redis_client` devuelve siempre la **misma** instancia (creada una vez en el
`lifespan` de `app/main.py`, guardada en `app.state.redis`) — nunca una nueva por
request, a diferencia de `get_db`. Ver docs/18-integracion-redis.md.

Tipado como `HTTPConnection` (la clase base común de `Request` y `WebSocket` en
Starlette), no como `Request`: `AuthService` (`app/modules/auth/dependencies.py`,
`get_auth_service`) depende, entre otras cosas, de `get_rate_limiter` -> acá abajo, y
`AuthService` es también la dependencia que usa el Gateway WebSocket
(`app/websocket/router.py`) para validar el token del primer mensaje -- con `Request`,
FastAPI no logra inyectar nada al resolver este dependency tree dentro de una ruta
`@router.websocket(...)` (`Request` solo existe en rutas HTTP) y la llamada termina
fallando en tiempo de ejecución con
`TypeError: get_redis_client() missing 1 required positional argument`. `HTTPConnection`
es exactamente lo que `app/snapshot/dependencies.py` y `app/moderation/dependencies.py`
ya usan por este mismo motivo para sus propias variantes locales de esta función --
corregirla acá, en la única definición compartida, evita que cada módulo nuevo que
necesite Redis desde el Gateway tenga que reinventar su propia copia."""

from typing import Annotated

from fastapi import Depends
from redis.asyncio import Redis
from starlette.requests import HTTPConnection

from app.redis.cache import RedisCache
from app.redis.locks import RedisLockFactory
from app.redis.metrics import RedisMetricsRecorder
from app.redis.pubsub import RedisPubSub
from app.redis.rate_limit import RedisRateLimiter
from app.redis.streams import RedisStreams


def get_redis_client(connection: HTTPConnection) -> Redis:
    return connection.app.state.redis


def get_cache(client: Annotated[Redis, Depends(get_redis_client)]) -> RedisCache:
    return RedisCache(client)


def get_pubsub(client: Annotated[Redis, Depends(get_redis_client)]) -> RedisPubSub:
    return RedisPubSub(client)


def get_streams(client: Annotated[Redis, Depends(get_redis_client)]) -> RedisStreams:
    return RedisStreams(client)


def get_lock_factory(client: Annotated[Redis, Depends(get_redis_client)]) -> RedisLockFactory:
    return RedisLockFactory(client)


def get_rate_limiter(client: Annotated[Redis, Depends(get_redis_client)]) -> RedisRateLimiter:
    return RedisRateLimiter(client)


def get_metrics_recorder(
    client: Annotated[Redis, Depends(get_redis_client)],
) -> RedisMetricsRecorder:
    return RedisMetricsRecorder(client)
