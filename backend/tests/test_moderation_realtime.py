"""Tests de `ModerationEventDispatcher` (Épica 7, Módulo 7.6) -- llamado directamente
con el JSON crudo que produciría `EventBus.publish`, sin pasar por Redis Pub/Sub real ni
por el `EventConsumer`. Mismo criterio que `test_postauction_realtime.py`.
"""

import uuid
from decimal import Decimal

import pytest_asyncio
from httpx import AsyncClient
from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker

from app.audit.models import AuditLogEntry
from app.core.config import get_settings
from app.events.base import DomainEvent
from app.moderation.realtime import ModerationEventDispatcher
from app.modules.ofertas.events import OfertaRejected
from app.notifications.models import Notification
from app.websocket.manager import ConnectionManager
from app.websocket.rooms import RoomManager

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
    client = Redis.from_url(get_settings().REDIS_URL, decode_responses=True)
    yield client
    await client.flushdb()
    await client.aclose()


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def _setup_remate(client: AsyncClient) -> tuple[uuid.UUID, uuid.UUID]:
    rematador_email = f"remat{uuid.uuid4()}@example.com"
    await client.post(
        REGISTER_URL,
        json={
            "email": rematador_email,
            "password": "password123",
            "full_name": "Test",
            "role": "rematador",
        },
    )
    login = await client.post(
        LOGIN_URL, data={"username": rematador_email, "password": "password123"}
    )
    rematador_token = login.json()["access_token"]

    buyer_email = f"buyer{uuid.uuid4()}@example.com"
    await client.post(
        REGISTER_URL,
        json={
            "email": buyer_email,
            "password": "password123",
            "full_name": "Comprador de prueba",
            "role": "comprador",
        },
    )
    buyer_login = await client.post(
        LOGIN_URL, data={"username": buyer_email, "password": "password123"}
    )
    buyer_token = buyer_login.json()["access_token"]
    buyer_me = await client.get("/api/v1/users/me", headers=_auth(buyer_token))
    buyer_id = uuid.UUID(buyer_me.json()["id"])

    remate_response = await client.post(
        REMATES_URL,
        json={"title": "Remate de campo", "category": "hacienda"},
        headers=_auth(rematador_token),
    )
    remate_id = uuid.UUID(remate_response.json()["id"])
    return remate_id, buyer_id


def _make_dispatcher(
    db_engine: AsyncEngine,
    redis_client: Redis,
    event_bus: _RecordingEventBus,
    settings=None,
) -> ModerationEventDispatcher:
    session_factory = async_sessionmaker(bind=db_engine, expire_on_commit=False)
    return ModerationEventDispatcher(
        session_factory,
        event_bus,
        ConnectionManager(),
        RoomManager(),
        redis_client,
        settings or get_settings(),
    )


async def test_invalid_bid_attempt_is_audited(
    client: AsyncClient, db_engine: AsyncEngine, redis_client: Redis
) -> None:
    remate_id, buyer_id = await _setup_remate(client)
    dispatcher = _make_dispatcher(db_engine, redis_client, _RecordingEventBus())
    event = OfertaRejected(
        remate_id=remate_id,
        oferta_id=uuid.uuid4(),
        lote_id=uuid.uuid4(),
        buyer_id=buyer_id,
        amount=Decimal("100"),
        reason="El monto debe ser al menos 200.",
    )

    await dispatcher.dispatch(event.model_dump_json())

    session_factory = async_sessionmaker(bind=db_engine, expire_on_commit=False)
    async with session_factory() as session:
        rows = (
            await session.execute(
                select(AuditLogEntry).where(
                    AuditLogEntry.action == "moderacion.intento_oferta_invalida"
                )
            )
        ).scalars().all()
    assert len(rows) == 1
    assert rows[0].remate_id == remate_id
    assert rows[0].actor_id == buyer_id


async def test_invalid_bid_attempt_notifies_owner_past_threshold(
    client: AsyncClient, db_engine: AsyncEngine, redis_client: Redis
) -> None:
    remate_id, buyer_id = await _setup_remate(client)
    event_bus = _RecordingEventBus()
    settings = get_settings()
    dispatcher = _make_dispatcher(db_engine, redis_client, event_bus, settings)

    for _ in range(settings.MODERATION_INVALID_BID_THRESHOLD):
        event = OfertaRejected(
            remate_id=remate_id,
            oferta_id=uuid.uuid4(),
            lote_id=uuid.uuid4(),
            buyer_id=buyer_id,
            amount=Decimal("100"),
            reason="El monto debe ser al menos 200.",
        )
        await dispatcher.dispatch(event.model_dump_json())

    threshold_events = [
        e
        for e in event_bus.published
        if e.event_type == "moderacion.umbral_ofertas_invalidas_superado"
    ]
    assert len(threshold_events) == 1

    session_factory = async_sessionmaker(bind=db_engine, expire_on_commit=False)
    async with session_factory() as session:
        rows = (await session.execute(select(Notification))).scalars().all()
    assert len(rows) == 1


async def test_ignores_event_types_outside_the_whitelist(
    db_engine: AsyncEngine, redis_client: Redis
) -> None:
    event_bus = _RecordingEventBus()
    dispatcher = _make_dispatcher(db_engine, redis_client, event_bus)

    payload = f'{{"event_type": "oferta.accepted", "remate_id": "{uuid.uuid4()}"}}'
    await dispatcher.dispatch(payload)

    assert event_bus.published == []


async def test_malformed_payload_does_not_raise(
    db_engine: AsyncEngine, redis_client: Redis
) -> None:
    dispatcher = _make_dispatcher(db_engine, redis_client, _RecordingEventBus())

    await dispatcher.dispatch("esto no es JSON")
    await dispatcher.dispatch('{"event_type": "oferta.rejected"}')  # sin ids
