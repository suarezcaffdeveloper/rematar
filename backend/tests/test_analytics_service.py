"""Tests de `AnalyticsService` (Épica 7, Módulo 7.1), llamado directamente (sin pasar
por HTTP) contra Postgres y Redis reales -- mismo criterio y mismos helpers que
`test_snapshot_service.py`. Los tests de HTTP end-to-end (200/403/404/401) están en
`test_analytics_router.py`.
"""

import uuid
from datetime import UTC, datetime
from decimal import Decimal

import pytest
import pytest_asyncio
from httpx import AsyncClient
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.analytics.repository import AnalyticsRepository
from app.analytics.service import AnalyticsService
from app.audit.repository import AuditLogRepository
from app.core.config import get_settings
from app.core.exceptions import ForbiddenError, NotFoundError
from app.core.security import hash_password
from app.events.base import DomainEvent
from app.modules.remates.lotes.repository import LoteRepository
from app.modules.remates.repository import RemateRepository
from app.modules.remates.service import RemateService
from app.modules.users.models import User, UserRole
from app.presence.schemas import ConnectedUserSummary
from app.redis.cache import RedisCache

REGISTER_URL = "/api/v1/auth/register"
LOGIN_URL = "/api/v1/auth/login"
REMATES_URL = "/api/v1/remates"


class _NoOpEventBus:
    """`RemateService.get_visible_or_raise` (lo único que este servicio usa) no publica
    eventos -- mismo fake que `test_snapshot_service.py`."""

    async def publish(self, event: DomainEvent) -> None:
        pass


class _FakePresenceService:
    """`AnalyticsService` solo llama a `connected_users_summary` (síncrono, mismo
    contrato que `PresenceService` real) -- un fake alcanza, sin necesitar `RoomManager`/
    `ConnectionManager` reales para estos tests."""

    def __init__(self, connected: list[ConnectedUserSummary]) -> None:
        self._connected = connected

    def connected_users_summary(self, remate_id: uuid.UUID) -> list[ConnectedUserSummary]:
        return self._connected


@pytest_asyncio.fixture
async def redis_client():
    redis = Redis.from_url(get_settings().REDIS_URL, decode_responses=True)
    try:
        yield redis
    finally:
        await redis.aclose()


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def _register_and_login(client: AsyncClient, *, email: str, role: str) -> tuple[str, str]:
    payload = {"email": email, "password": "password123", "full_name": "Test", "role": role}
    register = await client.post(REGISTER_URL, json=payload)
    login = await client.post(LOGIN_URL, data={"username": email, "password": "password123"})
    assert login.status_code == 200, login.text
    return register.json()["id"], login.json()["access_token"]


async def _owner(client: AsyncClient, email: str) -> tuple[str, str]:
    return await _register_and_login(client, email=email, role="rematador")


async def _buyer(client: AsyncClient, email: str) -> tuple[str, str]:
    return await _register_and_login(client, email=email, role="comprador")


async def _create_remate(client: AsyncClient, token: str, **overrides) -> dict:
    payload = {
        "title": "Remate de verificación de analítica",
        "category": "hacienda",
        "starts_at": "2027-06-01T10:00:00Z",
    }
    payload.update(overrides)
    r = await client.post(REMATES_URL, json=payload, headers=_auth(token))
    assert r.status_code == 201, r.text
    return r.json()


async def _create_lote(client: AsyncClient, token: str, remate_id: str, **overrides) -> dict:
    payload = {
        "lot_number": overrides.pop("lot_number", "1"),
        "title": "Toro Angus",
        "category": "hacienda",
        "base_price": "1000.00",
        "min_increment": "100.00",
    }
    payload.update(overrides)
    r = await client.post(f"{REMATES_URL}/{remate_id}/lotes", json=payload, headers=_auth(token))
    assert r.status_code == 201, r.text
    return r.json()


async def _start_remate(client: AsyncClient, token: str, remate_id: str) -> None:
    r = await client.post(f"{REMATES_URL}/{remate_id}/schedule", headers=_auth(token))
    assert r.status_code == 200, r.text
    r = await client.post(f"{REMATES_URL}/{remate_id}/start", headers=_auth(token))
    assert r.status_code == 200, r.text


async def _open_lote(client: AsyncClient, token: str, remate_id: str, lote_id: str) -> dict:
    r = await client.post(f"{REMATES_URL}/{remate_id}/lotes/{lote_id}/open", headers=_auth(token))
    assert r.status_code == 200, r.text
    return r.json()


async def _close_lote(
    client: AsyncClient,
    token: str,
    remate_id: str,
    lote_id: str,
    *,
    outcome: str = "unsold",
    final_price: str | None = None,
) -> None:
    payload: dict = {"outcome": outcome}
    if final_price is not None:
        payload["final_price"] = final_price
    r = await client.post(
        f"{REMATES_URL}/{remate_id}/lotes/{lote_id}/close", json=payload, headers=_auth(token)
    )
    assert r.status_code == 200, r.text


async def _bid(client: AsyncClient, token: str, remate_id: str, lote_id: str, amount: str) -> dict:
    r = await client.post(
        f"{REMATES_URL}/{remate_id}/lotes/{lote_id}/ofertas",
        json={"amount": amount},
        headers=_auth(token),
    )
    assert r.status_code == 201, r.text
    return r.json()


def _make_service(
    db_session: AsyncSession,
    *,
    presence: _FakePresenceService | None = None,
    cache: RedisCache | None = None,
    **kwargs,
) -> AnalyticsService:
    remate_service = RemateService(
        RemateRepository(db_session),
        LoteRepository(db_session),
        _NoOpEventBus(),
        AuditLogRepository(db_session),
    )
    return AnalyticsService(
        AnalyticsRepository(db_session),
        remate_service,
        presence or _FakePresenceService([]),
        cache=cache,
        **kwargs,
    )


async def _fetch_user(db_engine: AsyncEngine, user_id: str) -> User:
    session_factory = async_sessionmaker(bind=db_engine, expire_on_commit=False)
    async with session_factory() as session:
        user = await session.get(User, user_id)
        assert user is not None
        return user


# --- Agregación completa para el dueño -----------------------------------------------------


async def test_build_for_owner_aggregates_everything_correctly(
    client: AsyncClient, db_session: AsyncSession, db_engine: AsyncEngine
) -> None:
    owner_id, owner_token = await _owner(client, "an-svc1@example.com")
    _, buyer_token = await _buyer(client, "an-svc1-buyer@example.com")
    remate = await _create_remate(client, owner_token)
    lote = await _create_lote(client, owner_token, remate["id"])
    await _start_remate(client, owner_token, remate["id"])
    await _open_lote(client, owner_token, remate["id"], lote["id"])
    await _bid(client, buyer_token, remate["id"], lote["id"], "1000.00")
    await _bid(client, buyer_token, remate["id"], lote["id"], "2000.00")
    await _close_lote(
        client, owner_token, remate["id"], lote["id"], outcome="sold", final_price="2000.00"
    )
    owner = await _fetch_user(db_engine, owner_id)

    service = _make_service(db_session)
    snapshot = await service.build(uuid.UUID(remate["id"]), owner)

    assert snapshot.remate_id == uuid.UUID(remate["id"])
    assert snapshot.total_ofertas == 2
    assert snapshot.lote_status_counts.closed_sold == 1
    assert snapshot.lote_status_counts.total == 1
    assert snapshot.total_awarded_value == Decimal("2000.00")
    assert snapshot.highest_oferta is not None
    assert snapshot.highest_oferta.amount == Decimal("2000.00")
    assert snapshot.top_lote_by_offers is not None
    assert snapshot.top_lote_by_offers.offer_count == 2
    assert snapshot.connected_users_total == 0
    assert snapshot.connected_buyers == 0
    # "abrió el lote" + "cerró el lote (vendido)" (derivados de opened_at/closed_at) +
    # "remate.finished" -- RF-10 finaliza el remate solo al cerrarse su único lote.
    assert len(snapshot.recent_events) == 3
    assert snapshot.recent_events[0].event_type == "remate.finished"


# --- Control de acceso ------------------------------------------------------------------------


async def test_build_succeeds_for_admin_non_owner(
    client: AsyncClient, db_session: AsyncSession, db_engine: AsyncEngine
) -> None:
    _, owner_token = await _owner(client, "an-svc2@example.com")
    remate = await _create_remate(client, owner_token)
    lote = await _create_lote(client, owner_token, remate["id"])
    await _start_remate(client, owner_token, remate["id"])
    await _open_lote(client, owner_token, remate["id"], lote["id"])

    admin = User(
        email="an-svc2-admin@example.com",
        hashed_password=hash_password("adminpass123"),
        full_name="Admin",
        role=UserRole.ADMIN,
    )
    db_session.add(admin)
    await db_session.commit()
    await db_session.refresh(admin)

    service = _make_service(db_session)
    snapshot = await service.build(uuid.UUID(remate["id"]), admin)
    assert snapshot.remate_id == uuid.UUID(remate["id"])


async def test_build_denies_unrelated_comprador_on_live_remate_with_403_not_404(
    client: AsyncClient, db_session: AsyncSession, db_engine: AsyncEngine
) -> None:
    _, owner_token = await _owner(client, "an-svc3@example.com")
    stranger_id, stranger_token = await _buyer(client, "an-svc3-stranger@example.com")
    remate = await _create_remate(client, owner_token)
    await _create_lote(client, owner_token, remate["id"])
    await _start_remate(client, owner_token, remate["id"])
    stranger = await _fetch_user(db_engine, stranger_id)

    # Prueba que el remate SÍ es visible para el extraño -- el 403 de abajo es
    # deliberado (deniega el sub-recurso de analítica), no un 404 que ocultaría algo
    # que ya es público.
    visible = await client.get(f"{REMATES_URL}/{remate['id']}", headers=_auth(stranger_token))
    assert visible.status_code == 200

    service = _make_service(db_session)
    with pytest.raises(ForbiddenError):
        await service.build(uuid.UUID(remate["id"]), stranger)


async def test_build_raises_not_found_for_stranger_on_draft_remate(
    client: AsyncClient, db_session: AsyncSession, db_engine: AsyncEngine
) -> None:
    _, owner_token = await _owner(client, "an-svc4@example.com")
    stranger_id, _ = await _buyer(client, "an-svc4-stranger@example.com")
    remate = await _create_remate(client, owner_token)  # queda en DRAFT
    stranger = await _fetch_user(db_engine, stranger_id)

    service = _make_service(db_session)
    with pytest.raises(NotFoundError):
        await service.build(uuid.UUID(remate["id"]), stranger)


# --- Presencia: conectados totales vs. compradores conectados -----------------------------


async def test_connected_buyers_counts_only_the_comprador_role(
    client: AsyncClient, db_session: AsyncSession, db_engine: AsyncEngine
) -> None:
    owner_id, owner_token = await _owner(client, "an-svc5@example.com")
    buyer_id, _ = await _buyer(client, "an-svc5-buyer@example.com")
    other_owner_id, _ = await _owner(client, "an-svc5-owner2@example.com")
    remate = await _create_remate(client, owner_token)
    owner = await _fetch_user(db_engine, owner_id)

    connected = [
        ConnectedUserSummary(
            connection_id=uuid.uuid4(), user_id=uuid.UUID(buyer_id), connected_at=datetime.now(UTC)
        ),
        ConnectedUserSummary(
            connection_id=uuid.uuid4(), user_id=uuid.UUID(owner_id), connected_at=datetime.now(UTC)
        ),
        ConnectedUserSummary(
            connection_id=uuid.uuid4(),
            user_id=uuid.UUID(other_owner_id),
            connected_at=datetime.now(UTC),
        ),
    ]

    service = _make_service(db_session, presence=_FakePresenceService(connected))
    snapshot = await service.build(uuid.UUID(remate["id"]), owner)

    assert snapshot.connected_users_total == 3
    assert snapshot.connected_buyers == 1


# --- Cache (Redis real) -----------------------------------------------------------------------


async def test_build_serves_cached_aggregates_within_ttl(
    client: AsyncClient, db_session: AsyncSession, db_engine: AsyncEngine, redis_client: Redis
) -> None:
    owner_id, owner_token = await _owner(client, "an-svc6@example.com")
    _, buyer_token = await _buyer(client, "an-svc6-buyer@example.com")
    remate = await _create_remate(client, owner_token)
    lote = await _create_lote(client, owner_token, remate["id"])
    await _start_remate(client, owner_token, remate["id"])
    await _open_lote(client, owner_token, remate["id"], lote["id"])
    await _bid(client, buyer_token, remate["id"], lote["id"], "1000.00")
    owner = await _fetch_user(db_engine, owner_id)

    cache = RedisCache(redis_client)
    service = _make_service(db_session, cache=cache, cache_ttl_seconds=5.0)

    first = await service.build(uuid.UUID(remate["id"]), owner)
    assert first.total_ofertas == 1

    await _bid(client, buyer_token, remate["id"], lote["id"], "2000.00")  # bypassa la caché

    second = await service.build(uuid.UUID(remate["id"]), owner)
    assert second.total_ofertas == 1, "se esperaba servir los agregados cacheados"
