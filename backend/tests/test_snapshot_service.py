"""Tests de `SnapshotService` (Épica 3, Módulo 3.6), llamado directamente (sin pasar por
HTTP ni WebSocket) contra la base y Redis reales — mismo criterio del resto de la suite
(ver docstring de `tests/conftest.py`): nada de mocks para lo que ya hay infraestructura
real disponible. El estado de dominio se arma vía HTTP (reutiliza los endpoints ya
probados por `test_auction_engine.py`) porque es mucho menos código que insertar cada
fila a mano; lo que se testea acá es el método `SnapshotService.build` en sí.

Los tests de integración a través del Gateway WebSocket están en
`test_websocket_gateway.py`, sección "--- Snapshot ---"; los del endpoint HTTP en
`test_snapshot_http.py`.
"""

import asyncio
import uuid
from datetime import UTC, datetime
from decimal import Decimal

import pytest_asyncio
from httpx import AsyncClient
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.audit.repository import AuditLogRepository
from app.core.config import get_settings
from app.core.exceptions import NotFoundError
from app.core.security import hash_password
from app.events.base import DomainEvent
from app.modules.bots.models import BotPersonality, BotProfile
from app.modules.ofertas.repository import OfertaRepository
from app.modules.remates.lotes.repository import LoteRepository
from app.modules.remates.repository import RemateRepository
from app.modules.remates.service import RemateService
from app.modules.users.models import User, UserRole
from app.presence.schemas import ConnectedUserSummary
from app.redis.cache import RedisCache
from app.snapshot.service import SnapshotService

REGISTER_URL = "/api/v1/auth/register"
LOGIN_URL = "/api/v1/auth/login"
REMATES_URL = "/api/v1/remates"


class _NoOpEventBus:
    """`RemateService.get_visible_or_raise` (lo único que este servicio usa) no publica
    eventos -- un fake sin Redis alcanza y evita acoplar estos tests a esa
    infraestructura."""

    async def publish(self, event: DomainEvent) -> None:
        pass


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
    payload = {
        "email": email,
        "password": "password123",
        "confirm_password": "password123",
        "full_name": "Test",
        "phone": "+5491122334455",
        "role": role,
    }
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
        "title": "Remate de verificación de snapshot",
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
        "reserve_price": "5000.00",
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
    client: AsyncClient, token: str, remate_id: str, lote_id: str, *, outcome: str = "unsold"
) -> None:
    r = await client.post(
        f"{REMATES_URL}/{remate_id}/lotes/{lote_id}/close",
        json={"outcome": outcome},
        headers=_auth(token),
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
    db_session: AsyncSession, *, cache: RedisCache | None = None, **kwargs
) -> SnapshotService:
    remate_service = RemateService(
        RemateRepository(db_session),
        LoteRepository(db_session),
        _NoOpEventBus(),
        AuditLogRepository(db_session),
    )
    return SnapshotService(
        db_session, remate_service, OfertaRepository(db_session), cache=cache, **kwargs
    )


async def _fetch_user(db_engine: AsyncEngine, user_id: str) -> User:
    session_factory = async_sessionmaker(bind=db_engine, expire_on_commit=False)
    async with session_factory() as session:
        user = await session.get(User, user_id)
        assert user is not None
        return user


# --- Contenido básico del snapshot ------------------------------------------------------


async def test_snapshot_includes_remate_info_without_any_lote_opened(
    client: AsyncClient, db_session: AsyncSession, db_engine: AsyncEngine
) -> None:
    owner_id, owner_token = await _owner(client, "snap1@example.com")
    remate = await _create_remate(client, owner_token)
    owner = await _fetch_user(db_engine, owner_id)

    service = _make_service(db_session)
    snapshot = await service.build(remate["id"], owner, connected_users=3)

    assert str(snapshot.remate.id) == remate["id"]
    assert snapshot.remate.status == "draft"
    assert snapshot.active_lote is None
    assert snapshot.winning_offer is None
    assert snapshot.recent_offers == []
    assert snapshot.connected_users == 3


async def test_snapshot_includes_active_lote_when_one_is_open(
    client: AsyncClient, db_session: AsyncSession, db_engine: AsyncEngine
) -> None:
    owner_id, owner_token = await _owner(client, "snap2@example.com")
    remate = await _create_remate(client, owner_token)
    lote = await _create_lote(client, owner_token, remate["id"])
    await _start_remate(client, owner_token, remate["id"])
    await _open_lote(client, owner_token, remate["id"], lote["id"])
    owner = await _fetch_user(db_engine, owner_id)

    service = _make_service(db_session)
    snapshot = await service.build(remate["id"], owner)

    assert snapshot.active_lote is not None
    assert str(snapshot.active_lote.id) == lote["id"]
    assert snapshot.active_lote.status == "open"


async def test_open_lote_is_found_even_with_other_pending_and_closed_lotes(
    client: AsyncClient, db_session: AsyncSession, db_engine: AsyncEngine
) -> None:
    owner_id, owner_token = await _owner(client, "snap3@example.com")
    remate = await _create_remate(client, owner_token)
    lote_a = await _create_lote(client, owner_token, remate["id"], lot_number="1")
    lote_b = await _create_lote(client, owner_token, remate["id"], lot_number="2")
    await _create_lote(client, owner_token, remate["id"], lot_number="3")  # queda PENDING
    await _start_remate(client, owner_token, remate["id"])
    await _open_lote(client, owner_token, remate["id"], lote_a["id"])
    await _close_lote(client, owner_token, remate["id"], lote_a["id"])
    await _open_lote(client, owner_token, remate["id"], lote_b["id"])
    owner = await _fetch_user(db_engine, owner_id)

    service = _make_service(db_session)
    snapshot = await service.build(remate["id"], owner)

    assert snapshot.active_lote is not None
    assert str(snapshot.active_lote.id) == lote_b["id"]


# --- Oferta ganadora e historial ---------------------------------------------------------


async def test_snapshot_includes_winning_offer_and_recent_history(
    client: AsyncClient, db_session: AsyncSession, db_engine: AsyncEngine
) -> None:
    owner_id, owner_token = await _owner(client, "snap4@example.com")
    _, buyer_token = await _buyer(client, "snap4-buyer@example.com")
    remate = await _create_remate(client, owner_token)
    lote = await _create_lote(client, owner_token, remate["id"])
    await _start_remate(client, owner_token, remate["id"])
    await _open_lote(client, owner_token, remate["id"], lote["id"])
    await _bid(client, buyer_token, remate["id"], lote["id"], "1000.00")
    await _bid(client, buyer_token, remate["id"], lote["id"], "1200.00")
    owner = await _fetch_user(db_engine, owner_id)

    service = _make_service(db_session)
    snapshot = await service.build(remate["id"], owner)

    assert snapshot.winning_offer is not None
    assert snapshot.winning_offer.amount == Decimal("1200.00")
    assert len(snapshot.recent_offers) == 2
    # más reciente primero (mismo orden que OfertaRepository.list_by_lote).
    assert snapshot.recent_offers[0].amount == Decimal("1200.00")
    assert snapshot.recent_offers[1].amount == Decimal("1000.00")


async def test_snapshot_recent_offers_respects_configured_limit(
    client: AsyncClient, db_session: AsyncSession, db_engine: AsyncEngine
) -> None:
    owner_id, owner_token = await _owner(client, "snap5@example.com")
    _, buyer_token = await _buyer(client, "snap5-buyer@example.com")
    remate = await _create_remate(client, owner_token)
    lote = await _create_lote(client, owner_token, remate["id"])
    await _start_remate(client, owner_token, remate["id"])
    await _open_lote(client, owner_token, remate["id"], lote["id"])
    for amount in ("1000.00", "1100.00", "1200.00", "1300.00"):
        await _bid(client, buyer_token, remate["id"], lote["id"], amount)
    owner = await _fetch_user(db_engine, owner_id)

    service = _make_service(db_session, recent_offers_limit=2)
    snapshot = await service.build(remate["id"], owner)

    assert len(snapshot.recent_offers) == 2
    assert snapshot.recent_offers[0].amount == Decimal("1300.00")
    assert snapshot.recent_offers[1].amount == Decimal("1200.00")


# --- Enmascarado según privilegio del viewer ---------------------------------------------


async def test_snapshot_masks_reserve_price_and_buyer_id_for_non_privileged_viewer(
    client: AsyncClient, db_session: AsyncSession, db_engine: AsyncEngine
) -> None:
    owner_id, owner_token = await _owner(client, "snap6@example.com")
    buyer_id, buyer_token = await _buyer(client, "snap6-buyer@example.com")
    remate = await _create_remate(client, owner_token)
    lote = await _create_lote(client, owner_token, remate["id"], reserve_price="9999.00")
    await _start_remate(client, owner_token, remate["id"])
    await _open_lote(client, owner_token, remate["id"], lote["id"])
    await _bid(client, buyer_token, remate["id"], lote["id"], "1000.00")

    owner = await _fetch_user(db_engine, owner_id)
    buyer = await _fetch_user(db_engine, buyer_id)

    service = _make_service(db_session)
    owner_snapshot = await service.build(remate["id"], owner)
    buyer_snapshot = await service.build(remate["id"], buyer)

    assert owner_snapshot.active_lote.reserve_price == Decimal("9999.00")
    assert str(owner_snapshot.winning_offer.buyer_id) == buyer_id
    assert str(owner_snapshot.recent_offers[0].buyer_id) == buyer_id

    assert buyer_snapshot.active_lote.reserve_price is None
    assert buyer_snapshot.winning_offer.buyer_id is None
    assert buyer_snapshot.recent_offers[0].buyer_id is None


async def test_snapshot_does_not_mask_for_admin_viewer(
    client: AsyncClient, db_session: AsyncSession, db_engine: AsyncEngine
) -> None:
    owner_id, owner_token = await _owner(client, "snap7@example.com")
    buyer_id, buyer_token = await _buyer(client, "snap7-buyer@example.com")
    remate = await _create_remate(client, owner_token)
    lote = await _create_lote(client, owner_token, remate["id"], reserve_price="9999.00")
    await _start_remate(client, owner_token, remate["id"])
    await _open_lote(client, owner_token, remate["id"], lote["id"])
    await _bid(client, buyer_token, remate["id"], lote["id"], "1000.00")

    admin = User(
        email="snap7-admin@example.com",
        hashed_password=hash_password("adminpass123"),
        full_name="Admin",
        role=UserRole.ADMIN,
    )
    db_session.add(admin)
    await db_session.commit()
    await db_session.refresh(admin)

    service = _make_service(db_session)
    snapshot = await service.build(remate["id"], admin)

    assert snapshot.active_lote.reserve_price == Decimal("9999.00")
    assert str(snapshot.winning_offer.buyer_id) == buyer_id


# --- Identidad de simuladores (módulo de Bots) --------------------------------------------


async def test_snapshot_marks_bot_offers_as_is_bot(
    client: AsyncClient, db_session: AsyncSession, db_engine: AsyncEngine
) -> None:
    owner_id, owner_token = await _owner(client, "snap-bot1@example.com")
    _, human_token = await _buyer(client, "snap-bot1-human@example.com")
    remate = await _create_remate(client, owner_token)
    lote = await _create_lote(client, owner_token, remate["id"])
    await _start_remate(client, owner_token, remate["id"])
    await _open_lote(client, owner_token, remate["id"], lote["id"])

    bot_user = User(
        email="bot+snap-bot1@bots.rematar.internal",
        hashed_password=hash_password("botpass123"),
        full_name="Bot de prueba",
        role=UserRole.COMPRADOR,
    )
    db_session.add(bot_user)
    await db_session.commit()
    await db_session.refresh(bot_user)
    db_session.add(
        BotProfile(
            created_by_id=uuid.UUID(owner_id),
            user_id=bot_user.id,
            display_name="Bot de prueba",
            personality=BotPersonality.COMPETITIVE,
            max_budget=Decimal("5000.00"),
            reaction_delay_min_seconds=1,
            reaction_delay_max_seconds=2,
            continue_probability=Decimal("0.5"),
        )
    )
    await db_session.commit()

    login = await client.post(
        LOGIN_URL, data={"username": bot_user.email, "password": "botpass123"}
    )
    assert login.status_code == 200, login.text
    bot_token = login.json()["access_token"]

    await _bid(client, bot_token, remate["id"], lote["id"], "1000.00")
    await _bid(client, human_token, remate["id"], lote["id"], "1200.00")

    owner = await _fetch_user(db_engine, owner_id)
    service = _make_service(db_session)
    snapshot = await service.build(remate["id"], owner)

    assert snapshot.recent_offers[0].is_bot is False  # la oferta humana, más reciente
    assert snapshot.recent_offers[1].is_bot is True  # la oferta del bot
    assert snapshot.winning_offer.is_bot is False


# --- Detalle de presencia (Épica 6, Módulo 6.2) -------------------------------------------


async def test_snapshot_masks_connected_users_detail_for_non_privileged_viewer(
    client: AsyncClient, db_session: AsyncSession, db_engine: AsyncEngine
) -> None:
    owner_id, owner_token = await _owner(client, "snap-presence1@example.com")
    buyer_id, _buyer_token = await _buyer(client, "snap-presence1-buyer@example.com")
    remate = await _create_remate(client, owner_token)
    # "scheduled" alcanza para que un no-dueño lo vea (RemateService._is_visible) --
    # "start" exige al menos un lote (RF-08), innecesario para este test.
    r = await client.post(f"{REMATES_URL}/{remate['id']}/schedule", headers=_auth(owner_token))
    assert r.status_code == 200, r.text

    owner = await _fetch_user(db_engine, owner_id)
    buyer = await _fetch_user(db_engine, buyer_id)
    detail = [
        ConnectedUserSummary(
            connection_id=uuid.uuid4(),
            user_id=uuid.UUID(buyer_id),
            connected_at=datetime.now(UTC),
        )
    ]

    service = _make_service(db_session)
    owner_snapshot = await service.build(
        remate["id"], owner, connected_users=1, connected_users_detail=detail
    )
    buyer_snapshot = await service.build(
        remate["id"], buyer, connected_users=1, connected_users_detail=detail
    )

    assert owner_snapshot.connected_users_detail == detail
    assert buyer_snapshot.connected_users_detail is None
    # El conteo sigue visible para cualquiera -- solo se enmascara el detalle.
    assert buyer_snapshot.connected_users == 1


# --- Visibilidad / errores ----------------------------------------------------------------


async def test_snapshot_raises_not_found_for_draft_remate_seen_by_a_stranger(
    client: AsyncClient, db_session: AsyncSession, db_engine: AsyncEngine
) -> None:
    _, owner_token = await _owner(client, "snap8@example.com")
    stranger_id, _ = await _buyer(client, "snap8-stranger@example.com")
    remate = await _create_remate(client, owner_token)  # queda en DRAFT
    stranger = await _fetch_user(db_engine, stranger_id)

    service = _make_service(db_session)
    try:
        await service.build(remate["id"], stranger)
        raise AssertionError("se esperaba NotFoundError")
    except NotFoundError:
        pass


# --- Cache (Redis real) ---------------------------------------------------------------------


async def test_snapshot_serves_stale_cached_state_within_ttl(
    client: AsyncClient, db_session: AsyncSession, db_engine: AsyncEngine, redis_client: Redis
) -> None:
    owner_id, owner_token = await _owner(client, "snap9@example.com")
    remate = await _create_remate(client, owner_token)
    lote_a = await _create_lote(client, owner_token, remate["id"], lot_number="1")
    lote_b = await _create_lote(client, owner_token, remate["id"], lot_number="2")
    await _start_remate(client, owner_token, remate["id"])
    await _open_lote(client, owner_token, remate["id"], lote_a["id"])
    owner = await _fetch_user(db_engine, owner_id)

    cache = RedisCache(redis_client)
    service = _make_service(db_session, cache=cache, cache_ttl_seconds=5.0)

    first = await service.build(remate["id"], owner)
    assert str(first.active_lote.id) == lote_a["id"]

    # Cambia el estado real sin pasar por la caché -- si el segundo build() lee de
    # caché (TTL de 5s, recién usado), todavía debería ver lote_a como activo.
    await _close_lote(client, owner_token, remate["id"], lote_a["id"])
    await _open_lote(client, owner_token, remate["id"], lote_b["id"])

    second = await service.build(remate["id"], owner)
    assert str(second.active_lote.id) == lote_a["id"], "se esperaba servir el estado cacheado"


async def test_snapshot_refreshes_after_cache_ttl_expires(
    client: AsyncClient, db_session: AsyncSession, db_engine: AsyncEngine, redis_client: Redis
) -> None:
    owner_id, owner_token = await _owner(client, "snap10@example.com")
    remate = await _create_remate(client, owner_token)
    lote_a = await _create_lote(client, owner_token, remate["id"], lot_number="1")
    lote_b = await _create_lote(client, owner_token, remate["id"], lot_number="2")
    await _start_remate(client, owner_token, remate["id"])
    await _open_lote(client, owner_token, remate["id"], lote_a["id"])
    owner = await _fetch_user(db_engine, owner_id)

    # `RedisCache.set` (sin modificar) solo soporta segundos enteros de TTL -- el
    # mínimo TTL efectivo es 1s, así que el test espera 1.3s para confirmar la
    # expiración en vez de un valor sub-segundo (ver ADR-026, sección E).
    cache = RedisCache(redis_client)
    service = _make_service(db_session, cache=cache, cache_ttl_seconds=1.0)

    first = await service.build(remate["id"], owner)
    assert str(first.active_lote.id) == lote_a["id"]

    await _close_lote(client, owner_token, remate["id"], lote_a["id"])
    await _open_lote(client, owner_token, remate["id"], lote_b["id"])
    await asyncio.sleep(1.3)

    second = await service.build(remate["id"], owner)
    assert str(second.active_lote.id) == lote_b["id"]


async def test_snapshot_falls_back_to_db_when_cache_is_unavailable(
    client: AsyncClient, db_session: AsyncSession, db_engine: AsyncEngine
) -> None:
    class _BrokenCache:
        async def get(self, key: str) -> str | None:
            raise ConnectionError("Redis no disponible")

        async def set(self, key: str, value: str, *, ttl=None) -> None:
            raise ConnectionError("Redis no disponible")

    owner_id, owner_token = await _owner(client, "snap11@example.com")
    remate = await _create_remate(client, owner_token)
    lote = await _create_lote(client, owner_token, remate["id"])
    await _start_remate(client, owner_token, remate["id"])
    await _open_lote(client, owner_token, remate["id"], lote["id"])
    owner = await _fetch_user(db_engine, owner_id)

    service = _make_service(db_session, cache=_BrokenCache())
    snapshot = await service.build(remate["id"], owner)  # no debe lanzar

    assert str(snapshot.active_lote.id) == lote["id"]
