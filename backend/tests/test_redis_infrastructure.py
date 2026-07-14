"""Tests de integración de la infraestructura de Redis (Épica 3, Módulo 3.1).

Corren contra un Redis real (mismo criterio que el resto de la suite corre contra un
Postgres real, ver el docstring de `tests/conftest.py`) — no hay mocks acá. Lo que se
prueba es que el cliente compartido y las cuatro capas de infraestructura (cache,
pub/sub, streams, locks) efectivamente funcionan como plomería; no hay ninguna lógica de
negocio que las use todavía (ver docs/18-integracion-redis.md).
"""

import asyncio
import uuid

import pytest_asyncio
from httpx import AsyncClient
from redis.asyncio import Redis

from app.core.config import get_settings
from app.redis.cache import RedisCache
from app.redis.locks import RedisLockFactory
from app.redis.pubsub import RedisPubSub
from app.redis.streams import RedisStreams


@pytest_asyncio.fixture
async def redis_client():
    client = Redis.from_url(get_settings().REDIS_URL, decode_responses=True)
    yield client
    await client.flushdb()  # DB 1 (ver conftest.py), aislada de la DB 0 de desarrollo.
    await client.aclose()


def _unique_key(prefix: str) -> str:
    return f"test:{prefix}:{uuid.uuid4()}"


# --- Health check ------------------------------------------------------------------


async def test_health_check_reports_redis_ok(client: AsyncClient) -> None:
    response = await client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["checks"]["redis"] == "ok"


# --- Cache ---------------------------------------------------------------------------


async def test_cache_set_get_delete_roundtrip(redis_client: Redis) -> None:
    cache = RedisCache(redis_client)
    key = _unique_key("cache")

    assert await cache.get(key) is None
    assert await cache.exists(key) is False

    await cache.set(key, "hello", ttl=30)
    assert await cache.get(key) == "hello"
    assert await cache.exists(key) is True

    await cache.delete(key)
    assert await cache.get(key) is None


# --- Pub/Sub ---------------------------------------------------------------------


async def test_pubsub_publish_delivers_to_subscriber(redis_client: Redis) -> None:
    pubsub_service = RedisPubSub(redis_client)
    channel = _unique_key("channel")

    async with pubsub_service.subscribe(channel) as pubsub:
        # El primer mensaje que entrega `get_message` tras suscribirse es la
        # confirmación de suscripción, no un mensaje de dato — hay que descartarlo.
        await asyncio.wait_for(pubsub.get_message(timeout=1), timeout=2)

        subscriber_count = await pubsub_service.publish(channel, "hola")
        assert subscriber_count == 1

        message = await asyncio.wait_for(
            pubsub.get_message(timeout=1, ignore_subscribe_messages=True), timeout=2
        )
        assert message is not None
        assert message["data"] == "hola"


async def test_pubsub_publish_without_subscribers_returns_zero(redis_client: Redis) -> None:
    pubsub_service = RedisPubSub(redis_client)
    channel = _unique_key("channel")

    subscriber_count = await pubsub_service.publish(channel, "nadie escucha")
    assert subscriber_count == 0


# --- Streams -----------------------------------------------------------------------


async def test_streams_add_and_read_roundtrip(redis_client: Redis) -> None:
    streams = RedisStreams(redis_client)
    stream_name = _unique_key("stream")

    entry_id = await streams.add(stream_name, {"event": "test", "value": "1"})
    assert entry_id

    response = await streams.read(stream_name, last_id="0")
    assert len(response) == 1
    returned_stream, entries = response[0]
    assert returned_stream == stream_name
    assert entries[0][0] == entry_id
    assert entries[0][1] == {"event": "test", "value": "1"}


# --- Locks -------------------------------------------------------------------------


async def test_lock_prevents_concurrent_acquisition(redis_client: Redis) -> None:
    lock_factory = RedisLockFactory(redis_client)
    key = _unique_key("lock")

    async with lock_factory.acquire(key, timeout=5.0, blocking_timeout=0.2):
        try:
            async with lock_factory.acquire(key, timeout=5.0, blocking_timeout=0.2):
                raise AssertionError("no debería poder adquirir el lock dos veces")
        except TimeoutError:
            pass


async def test_lock_released_can_be_reacquired(redis_client: Redis) -> None:
    lock_factory = RedisLockFactory(redis_client)
    key = _unique_key("lock")

    async with lock_factory.acquire(key, timeout=5.0, blocking_timeout=0.2):
        pass

    # Liberado al salir del `async with` anterior: debería poder tomarse de nuevo ya.
    async with lock_factory.acquire(key, timeout=5.0, blocking_timeout=0.2):
        pass
