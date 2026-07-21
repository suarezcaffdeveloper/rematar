"""Tests de `RedisRateLimiter` (Épica 6, Módulo 6.4), en aislamiento -- Redis real, sin
mocks, mismo criterio que `test_redis_infrastructure.py`. Ver docs/34-chat-del-remate.md.
"""

import asyncio
import uuid

import pytest_asyncio
from redis.asyncio import Redis

from app.core.config import get_settings
from app.redis.rate_limit import RedisRateLimiter


@pytest_asyncio.fixture
async def redis_client():
    client = Redis.from_url(get_settings().REDIS_URL, decode_responses=True)
    yield client
    await client.flushdb()
    await client.aclose()


def _unique_key() -> str:
    return f"test:ratelimit:{uuid.uuid4()}"


async def test_allows_requests_within_the_limit(redis_client: Redis) -> None:
    limiter = RedisRateLimiter(redis_client)
    key = _unique_key()

    for _ in range(3):
        assert await limiter.check_and_increment(key, limit=3, window_seconds=10) is True


async def test_rejects_requests_once_the_limit_is_exceeded(redis_client: Redis) -> None:
    limiter = RedisRateLimiter(redis_client)
    key = _unique_key()

    for _ in range(3):
        await limiter.check_and_increment(key, limit=3, window_seconds=10)

    assert await limiter.check_and_increment(key, limit=3, window_seconds=10) is False


async def test_independent_keys_do_not_share_a_counter(redis_client: Redis) -> None:
    limiter = RedisRateLimiter(redis_client)
    key_a, key_b = _unique_key(), _unique_key()

    for _ in range(3):
        await limiter.check_and_increment(key_a, limit=3, window_seconds=10)

    assert await limiter.check_and_increment(key_b, limit=3, window_seconds=10) is True


async def test_resets_after_the_window_expires(redis_client: Redis) -> None:
    limiter = RedisRateLimiter(redis_client)
    key = _unique_key()

    assert await limiter.check_and_increment(key, limit=1, window_seconds=1) is True
    assert await limiter.check_and_increment(key, limit=1, window_seconds=1) is False

    await asyncio.sleep(1.2)

    assert await limiter.check_and_increment(key, limit=1, window_seconds=1) is True


async def test_window_ttl_is_fixed_from_the_first_hit_not_extended_by_later_ones(
    redis_client: Redis,
) -> None:
    limiter = RedisRateLimiter(redis_client)
    key = _unique_key()

    await limiter.check_and_increment(key, limit=5, window_seconds=10)
    first_ttl = await redis_client.ttl(key)
    await limiter.check_and_increment(key, limit=5, window_seconds=10)
    second_ttl = await redis_client.ttl(key)

    assert first_ttl > 0
    assert second_ttl <= first_ttl
