"""Tests de `ChatSystemEventDispatcher` (Épica 6, Módulo 6.4) -- llamado directamente
con el JSON crudo que produciría `EventBus.publish` (mismo criterio que
`test_realtime_dispatcher.py` para `EventDispatcher`), sin pasar por Redis Pub/Sub real
ni por el `EventConsumer`. Ver docs/34-chat-del-remate.md y ADR-037.

A diferencia de los eventos de presencia (que no tocan Postgres), `ChatMessage.remate_id`
es una FK real a `remates.id` -- cada test crea un remate real vía HTTP antes de
despachar el evento correspondiente, mismo criterio que el resto de la suite.
"""

import uuid
from decimal import Decimal

import pytest_asyncio
from httpx import AsyncClient
from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker

from app.core.config import get_settings
from app.events.base import DomainEvent
from app.modules.chat.events import ChatMessageSent
from app.modules.chat.models import ChatMessage
from app.modules.chat.realtime import ChatSystemEventDispatcher
from app.modules.ofertas.events import OfertaAccepted
from app.modules.remates.events import RemateFinished, RematePaused, RemateResumed, RemateStarted
from app.modules.remates.lotes.events import LoteClosed, LoteOpened
from app.redis.rate_limit import RedisRateLimiter

REGISTER_URL = "/api/v1/auth/register"
LOGIN_URL = "/api/v1/auth/login"
REMATES_URL = "/api/v1/remates"


class _RecordingEventBus:
    def __init__(self) -> None:
        self.published: list[DomainEvent] = []

    async def publish(self, event: DomainEvent) -> None:
        self.published.append(event)


@pytest_asyncio.fixture
async def redis_client():
    redis = Redis.from_url(get_settings().REDIS_URL, decode_responses=True)
    try:
        yield redis
    finally:
        await redis.flushdb()
        await redis.aclose()


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def _create_remate(client: AsyncClient, email: str) -> uuid.UUID:
    payload = {
        "email": email,
        "password": "password123",
        "confirm_password": "password123",
        "full_name": "Test",
        "phone": "+5491122334455",
        "role": "rematador",
    }
    await client.post(REGISTER_URL, json=payload)
    login = await client.post(LOGIN_URL, data={"username": email, "password": "password123"})
    assert login.status_code == 200, login.text
    token = login.json()["access_token"]

    r = await client.post(
        REMATES_URL,
        json={
            "title": "Remate de mensajes de sistema",
            "category": "hacienda",
            "starts_at": "2027-06-01T10:00:00Z",
        },
        headers=_auth(token),
    )
    assert r.status_code == 201, r.text
    return uuid.UUID(r.json()["id"])


def _make_dispatcher(
    db_engine: AsyncEngine, redis_client: Redis, event_bus: _RecordingEventBus
) -> ChatSystemEventDispatcher:
    session_factory = async_sessionmaker(bind=db_engine, expire_on_commit=False)
    return ChatSystemEventDispatcher(
        session_factory, event_bus, RedisRateLimiter(redis_client), get_settings()
    )


async def _content_of_only_message(db_engine: AsyncEngine) -> str:
    session_factory = async_sessionmaker(bind=db_engine, expire_on_commit=False)
    async with session_factory() as session:
        rows = (await session.execute(select(ChatMessage))).scalars().all()
        assert len(rows) == 1, rows
        return rows[0].content


async def test_remate_started_generates_a_system_message(
    client: AsyncClient, db_engine: AsyncEngine, redis_client: Redis
) -> None:
    remate_id = await _create_remate(client, "chatrt1@example.com")
    event_bus = _RecordingEventBus()
    dispatcher = _make_dispatcher(db_engine, redis_client, event_bus)
    event = RemateStarted(remate_id=remate_id)

    await dispatcher.dispatch(event.model_dump_json())

    assert await _content_of_only_message(db_engine) == "El remate comenzó."
    assert len(event_bus.published) == 1
    assert isinstance(event_bus.published[0], ChatMessageSent)


async def test_remate_paused_and_resumed_generate_their_own_text(
    client: AsyncClient, db_engine: AsyncEngine, redis_client: Redis
) -> None:
    remate_id = await _create_remate(client, "chatrt2@example.com")
    event_bus = _RecordingEventBus()
    dispatcher = _make_dispatcher(db_engine, redis_client, event_bus)

    await dispatcher.dispatch(RematePaused(remate_id=remate_id).model_dump_json())
    await dispatcher.dispatch(RemateResumed(remate_id=remate_id).model_dump_json())

    contents = {e.content for e in event_bus.published if isinstance(e, ChatMessageSent)}
    assert contents == {"El remate fue pausado.", "El remate se reanudó."}


async def test_remate_finished_generates_a_system_message(
    client: AsyncClient, db_engine: AsyncEngine, redis_client: Redis
) -> None:
    remate_id = await _create_remate(client, "chatrt3@example.com")
    event_bus = _RecordingEventBus()
    dispatcher = _make_dispatcher(db_engine, redis_client, event_bus)
    event = RemateFinished(remate_id=remate_id, triggered_by="manual")

    await dispatcher.dispatch(event.model_dump_json())

    assert await _content_of_only_message(db_engine) == "El remate finalizó."


async def test_lote_opened_includes_the_lot_number(
    client: AsyncClient, db_engine: AsyncEngine, redis_client: Redis
) -> None:
    remate_id = await _create_remate(client, "chatrt4@example.com")
    event_bus = _RecordingEventBus()
    dispatcher = _make_dispatcher(db_engine, redis_client, event_bus)
    event = LoteOpened(remate_id=remate_id, lote_id=uuid.uuid4(), lot_number="7", display_order=0)

    await dispatcher.dispatch(event.model_dump_json())

    assert await _content_of_only_message(db_engine) == "Se abrió el lote 7."


async def test_lote_closed_text_depends_on_outcome(
    client: AsyncClient, db_engine: AsyncEngine, redis_client: Redis
) -> None:
    remate_id = await _create_remate(client, "chatrt5@example.com")
    event_bus = _RecordingEventBus()
    dispatcher = _make_dispatcher(db_engine, redis_client, event_bus)

    sold = LoteClosed(
        remate_id=remate_id,
        lote_id=uuid.uuid4(),
        outcome="sold",
        final_price=Decimal("100"),
        triggered_by="manual",
    )
    await dispatcher.dispatch(sold.model_dump_json())

    contents = {e.content for e in event_bus.published if isinstance(e, ChatMessageSent)}
    assert contents == {"Se cerró un lote (vendido)."}


async def test_ignores_event_types_outside_the_whitelist(
    client: AsyncClient, db_engine: AsyncEngine, redis_client: Redis
) -> None:
    remate_id = await _create_remate(client, "chatrt6@example.com")
    event_bus = _RecordingEventBus()
    dispatcher = _make_dispatcher(db_engine, redis_client, event_bus)
    event = OfertaAccepted(
        remate_id=remate_id,
        oferta_id=uuid.uuid4(),
        lote_id=uuid.uuid4(),
        buyer_id=uuid.uuid4(),
        amount=Decimal("100"),
    )

    await dispatcher.dispatch(event.model_dump_json())

    assert event_bus.published == []


async def test_never_reacts_to_its_own_chat_events_no_infinite_loop(
    client: AsyncClient, db_engine: AsyncEngine, redis_client: Redis
) -> None:
    remate_id = await _create_remate(client, "chatrt7@example.com")
    event_bus = _RecordingEventBus()
    dispatcher = _make_dispatcher(db_engine, redis_client, event_bus)
    own_event = ChatMessageSent(
        remate_id=remate_id,
        message_id=uuid.uuid4(),
        kind="system",
        author_id=None,
        author_name=None,
        author_role=None,
        content="El remate comenzó.",
        system_event_type="remate.started",
        created_at="2026-01-01T00:00:00Z",
    )

    await dispatcher.dispatch(own_event.model_dump_json())

    assert event_bus.published == []


async def test_idempotent_when_the_same_event_is_dispatched_twice(
    client: AsyncClient, db_engine: AsyncEngine, redis_client: Redis
) -> None:
    """Simula dos instancias del backend reaccionando al mismo `PUBLISH` -- el índice
    único parcial sobre `source_event_id` (`models.py`) evita la fila duplicada."""
    remate_id = await _create_remate(client, "chatrt8@example.com")
    event_bus = _RecordingEventBus()
    dispatcher_a = _make_dispatcher(db_engine, redis_client, event_bus)
    dispatcher_b = _make_dispatcher(db_engine, redis_client, event_bus)
    raw_payload = RemateStarted(remate_id=remate_id).model_dump_json()

    await dispatcher_a.dispatch(raw_payload)
    await dispatcher_b.dispatch(raw_payload)

    assert await _content_of_only_message(db_engine) == "El remate comenzó."
    sent_events = [e for e in event_bus.published if isinstance(e, ChatMessageSent)]
    assert len(sent_events) == 1


async def test_malformed_payload_does_not_raise(
    client: AsyncClient, db_engine: AsyncEngine, redis_client: Redis
) -> None:
    event_bus = _RecordingEventBus()
    dispatcher = _make_dispatcher(db_engine, redis_client, event_bus)

    await dispatcher.dispatch("esto no es JSON")
    await dispatcher.dispatch('{"event_type": "remate.started"}')  # sin remate_id/event_id

    assert event_bus.published == []


async def test_event_for_nonexistent_remate_does_not_raise(
    db_engine: AsyncEngine, redis_client: Redis
) -> None:
    """El evento trae un `remate_id` bien formado pero sin fila real (ej. un remate
    borrado entre la publicación del evento y su procesamiento) -- `record_system_message`
    ve un `IntegrityError` de la FK, lo atrapa como si fuera una carrera de idempotencia
    (ver `service.py`) y no encuentra la fila -- `dispatch` no debe romper por esto."""
    event_bus = _RecordingEventBus()
    dispatcher = _make_dispatcher(db_engine, redis_client, event_bus)

    await dispatcher.dispatch(RemateStarted(remate_id=uuid.uuid4()).model_dump_json())

    assert event_bus.published == []
