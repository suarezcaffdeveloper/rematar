"""Tests de `ModerationRedisGateway` (Épica 7, Módulo 7.6), en aislamiento -- Redis
real, sin mocks, mismo criterio que `test_redis_rate_limit.py`.
"""

import uuid

import pytest_asyncio
from redis.asyncio import Redis

from app.core.config import get_settings
from app.moderation.redis_state import ModerationRedisGateway


@pytest_asyncio.fixture
async def redis_client():
    client = Redis.from_url(get_settings().REDIS_URL, decode_responses=True)
    yield client
    await client.flushdb()
    await client.aclose()


def _ids() -> tuple[uuid.UUID, uuid.UUID]:
    return uuid.uuid4(), uuid.uuid4()


async def test_user_is_not_muted_by_default(redis_client: Redis) -> None:
    gateway = ModerationRedisGateway(redis_client)
    remate_id, user_id = _ids()

    assert await gateway.is_muted(remate_id, user_id) is False


async def test_mute_sets_is_muted_until_it_expires(redis_client: Redis) -> None:
    gateway = ModerationRedisGateway(redis_client)
    remate_id, user_id = _ids()

    await gateway.mute(remate_id, user_id, duration_seconds=60)

    assert await gateway.is_muted(remate_id, user_id) is True


async def test_mute_is_scoped_per_remate_and_per_user(redis_client: Redis) -> None:
    gateway = ModerationRedisGateway(redis_client)
    remate_id, user_id = _ids()
    other_remate_id, other_user_id = _ids()

    await gateway.mute(remate_id, user_id, duration_seconds=60)

    assert await gateway.is_muted(other_remate_id, user_id) is False
    assert await gateway.is_muted(remate_id, other_user_id) is False


async def test_chat_lock_blocks_the_whole_room(redis_client: Redis) -> None:
    gateway = ModerationRedisGateway(redis_client)
    remate_id, _ = _ids()

    assert await gateway.is_chat_locked(remate_id) is False
    await gateway.lock_chat(remate_id, duration_seconds=60)
    assert await gateway.is_chat_locked(remate_id) is True


async def test_record_invalid_bid_attempt_increments_across_calls(redis_client: Redis) -> None:
    gateway = ModerationRedisGateway(redis_client)
    remate_id, buyer_id = _ids()

    first = await gateway.record_invalid_bid_attempt(remate_id, buyer_id, window_seconds=300)
    second = await gateway.record_invalid_bid_attempt(remate_id, buyer_id, window_seconds=300)
    third = await gateway.record_invalid_bid_attempt(remate_id, buyer_id, window_seconds=300)

    assert (first, second, third) == (1, 2, 3)


async def test_invalid_bid_counters_are_independent_per_buyer(redis_client: Redis) -> None:
    gateway = ModerationRedisGateway(redis_client)
    remate_id, buyer_a = _ids()
    _, buyer_b = _ids()

    await gateway.record_invalid_bid_attempt(remate_id, buyer_a, window_seconds=300)
    count_b = await gateway.record_invalid_bid_attempt(remate_id, buyer_b, window_seconds=300)

    assert count_b == 1


async def test_threshold_notification_flag_starts_unset_and_can_be_marked(
    redis_client: Redis,
) -> None:
    gateway = ModerationRedisGateway(redis_client)
    remate_id, buyer_id = _ids()

    assert await gateway.has_notified_invalid_bid_threshold(remate_id, buyer_id) is False

    await gateway.mark_invalid_bid_threshold_notified(remate_id, buyer_id, window_seconds=300)

    assert await gateway.has_notified_invalid_bid_threshold(remate_id, buyer_id) is True
