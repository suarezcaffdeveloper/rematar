"""Tests de `BotEventDispatcher` (`app/modules/bots/dispatcher.py`) -- mismo criterio
que `test_chat_realtime_system_messages.py`: se llama `dispatch` directamente con el
JSON crudo que produciría `EventBus.publish`, sin pasar por Redis Pub/Sub real. Cubre el
contrato "nunca lanza" y que `remate.finished`/`remate.cancelled` detienen la simulación
y la dejan persistida como `stopped` (no puede quedar "corriendo" en un remate ya
terminado)."""

import uuid

import pytest_asyncio
from httpx import AsyncClient
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.core.config import get_settings
from app.events.base import DomainEvent
from app.modules.bots.dispatcher import BotEventDispatcher
from app.modules.bots.models import BotSimulationRun, BotSimulationStatus
from app.modules.bots.runner import BotRunnerRegistry
from app.modules.remates.events import RemateFinished
from app.modules.remates.lotes.events import LoteOpened
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
        await redis.aclose()


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def _setup_open_lote(client: AsyncClient, email: str) -> tuple[str, str, str]:
    payload = {
        "email": email,
        "password": "password123",
        "confirm_password": "password123",
        "full_name": "Test",
        "phone": "+5491122334455",
        "role": "rematador",
    }
    r = await client.post(REGISTER_URL, json=payload)
    assert r.status_code == 201, r.text
    owner_id = r.json()["id"]
    login = await client.post(LOGIN_URL, data={"username": email, "password": "password123"})
    owner_token = login.json()["access_token"]

    r = await client.post(
        REMATES_URL,
        json={"title": "Remate dispatcher", "category": "hacienda", "starts_at": "2027-06-01T10:00:00Z"},
        headers=_auth(owner_token),
    )
    remate = r.json()
    r = await client.post(
        f"{REMATES_URL}/{remate['id']}/lotes",
        json={
            "lot_number": "1", "title": "Toro", "category": "hacienda",
            "base_price": "1000.00", "min_increment": "100.00",
        },
        headers=_auth(owner_token),
    )
    lote = r.json()
    await client.post(f"{REMATES_URL}/{remate['id']}/schedule", headers=_auth(owner_token))
    await client.post(f"{REMATES_URL}/{remate['id']}/start", headers=_auth(owner_token))
    await client.post(f"{REMATES_URL}/{remate['id']}/lotes/{lote['id']}/open", headers=_auth(owner_token))

    return owner_id, remate["id"], lote["id"]


def _make_dispatcher(db_engine: AsyncEngine, redis_client: Redis) -> tuple[BotEventDispatcher, BotRunnerRegistry]:
    session_factory = async_sessionmaker(bind=db_engine, expire_on_commit=False)
    registry = BotRunnerRegistry(
        session_factory, _RecordingEventBus(), RedisRateLimiter(redis_client), get_settings()
    )
    return BotEventDispatcher(session_factory, registry), registry


async def test_dispatch_ignores_malformed_json(client: AsyncClient, db_engine: AsyncEngine, redis_client: Redis) -> None:
    dispatcher, _registry = _make_dispatcher(db_engine, redis_client)
    await dispatcher.dispatch("not-json")  # no debe lanzar


async def test_dispatch_ignores_irrelevant_event_type(
    client: AsyncClient, db_engine: AsyncEngine, redis_client: Redis
) -> None:
    dispatcher, _registry = _make_dispatcher(db_engine, redis_client)
    await dispatcher.dispatch('{"event_type": "remate.scheduled", "remate_id": "%s"}' % uuid.uuid4())


async def test_remate_finished_stops_running_simulation_in_database(
    client: AsyncClient, db_session: AsyncSession, db_engine: AsyncEngine, redis_client: Redis
) -> None:
    owner_id, remate_id, lote_id = await _setup_open_lote(client, "dispatch-finish1@example.com")

    run = BotSimulationRun(remate_id=uuid.UUID(remate_id), status=BotSimulationStatus.RUNNING)
    db_session.add(run)
    await db_session.commit()

    dispatcher, registry = _make_dispatcher(db_engine, redis_client)
    event = RemateFinished(remate_id=uuid.UUID(remate_id), triggered_by="manual")
    await dispatcher.dispatch(event.model_dump_json())

    session_factory = async_sessionmaker(bind=db_engine, expire_on_commit=False)
    async with session_factory() as session:
        refreshed = await session.get(BotSimulationRun, run.id)
        assert refreshed is not None
        assert refreshed.status == BotSimulationStatus.STOPPED
        assert refreshed.stop_reason == "remate_finished"

    assert registry.get(uuid.UUID(remate_id)) is None


async def test_lote_opened_tracks_active_lote_on_existing_runner(
    client: AsyncClient, db_engine: AsyncEngine, redis_client: Redis
) -> None:
    owner_id, remate_id, lote_id = await _setup_open_lote(client, "dispatch-open1@example.com")

    dispatcher, registry = _make_dispatcher(db_engine, redis_client)
    # Simula que la simulación ya estaba corriendo (sin bots seleccionados, para no
    # generar ninguna reacción real en este test).
    await registry.start(uuid.UUID(remate_id), None)

    event = LoteOpened(
        remate_id=uuid.UUID(remate_id), lote_id=uuid.UUID(lote_id), lot_number="1", display_order=0
    )
    await dispatcher.dispatch(event.model_dump_json())

    runner = registry.get(uuid.UUID(remate_id))
    assert runner is not None
    assert runner.active_lote_id == uuid.UUID(lote_id)
