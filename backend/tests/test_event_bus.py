"""Tests de infraestructura del Event Bus (Épica 3, Módulo 3.2).

Cubren la infraestructura pura (`RemateScopedEvent.topic`, `RedisEventBus.publish`
serializa y publica correctamente, nunca lanza aunque Redis sea inalcanzable) — no
disparan ninguna acción de dominio, eso está en `tests/test_domain_events.py`.
"""

import asyncio
import json
import uuid
from typing import Literal

from redis.asyncio import Redis

from app.core.config import get_settings
from app.events.base import RemateScopedEvent
from app.events.redis_bus import RedisEventBus
from app.redis.pubsub import RedisPubSub


class _SampleEvent(RemateScopedEvent):
    event_type: Literal["sample.event"] = "sample.event"
    value: str


async def test_topic_is_scoped_by_remate_id() -> None:
    remate_id = uuid.uuid4()
    event = _SampleEvent(remate_id=remate_id, value="x")
    assert event.topic == f"events.{remate_id}"


async def test_redis_event_bus_publishes_serialized_event() -> None:
    client = Redis.from_url(get_settings().REDIS_URL, decode_responses=True)
    bus = RedisEventBus(RedisPubSub(client))
    remate_id = uuid.uuid4()
    event = _SampleEvent(remate_id=remate_id, value="hola")

    pubsub = client.pubsub()
    await pubsub.subscribe(event.topic)
    try:
        await asyncio.wait_for(pubsub.get_message(timeout=1), timeout=2)  # confirmación

        await bus.publish(event)

        message = await asyncio.wait_for(
            pubsub.get_message(timeout=1, ignore_subscribe_messages=True), timeout=2
        )
        assert message is not None
        payload = json.loads(message["data"])
        assert payload["event_type"] == "sample.event"
        assert payload["remate_id"] == str(remate_id)
        assert payload["value"] == "hola"
        assert "event_id" in payload
        assert "occurred_at" in payload
    finally:
        await pubsub.unsubscribe(event.topic)
        await pubsub.aclose()
        await client.aclose()


async def test_redis_event_bus_publish_never_raises_when_redis_unreachable() -> None:
    """Contrato de `EventBus.publish` (ADR-022, sección D): best-effort, nunca lanza —
    ni siquiera si Redis es completamente inalcanzable."""
    unreachable_client = Redis.from_url("redis://127.0.0.1:1/0", decode_responses=True)
    bus = RedisEventBus(RedisPubSub(unreachable_client))
    event = _SampleEvent(remate_id=uuid.uuid4(), value="no debería fallar")

    await bus.publish(event)  # no debe lanzar ninguna excepción

    await unreachable_client.aclose()
