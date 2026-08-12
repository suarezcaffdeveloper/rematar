"""Tests de `RemateBotRunner`/`BotRunnerRegistry` (`app/modules/bots/runner.py`),
llamados directamente contra la base y Redis reales -- mismo criterio que
`test_chat_realtime_system_messages.py::_make_dispatcher` para
`ChatSystemEventDispatcher`: se prueba el componente en sí, sin pasar por el
`EventConsumer`/Redis Pub/Sub real, así los tiempos de espera son exclusivamente los de
`reaction_delay_*_seconds` de cada bot (nunca latencia de red).

Cubre específicamente los requisitos del enunciado: la oferta la coloca el motor real
(`AuctionEngine.place_bid`, se verifica leyendo la fila `Oferta` resultante), respeto del
presupuesto máximo, competencia entre varios bots (montos crecientes, respetando el
incremento mínimo), cancelación correcta de tareas al Detener y al cerrarse el lote, y
participación en el chat.
"""

import asyncio
import uuid
from decimal import Decimal

import pytest_asyncio
from httpx import AsyncClient
from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.core.config import get_settings
from app.core.security import hash_password
from app.events.base import DomainEvent
from app.modules.bots.models import BotPersonality, BotProfile, BotRemateSelection
from app.modules.bots.runner import BotRunnerRegistry
from app.modules.chat.models import ChatMessage
from app.modules.ofertas.models import Oferta, OfertaStatus
from app.modules.users.models import User, UserRole
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


async def _rematador(client: AsyncClient, email: str) -> tuple[str, str]:
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
    login = await client.post(LOGIN_URL, data={"username": email, "password": "password123"})
    assert login.status_code == 200, login.text
    return r.json()["id"], login.json()["access_token"]


async def _setup_open_lote(
    client: AsyncClient, email: str, **lote_overrides
) -> tuple[str, str, str, Decimal, Decimal]:
    owner_id, owner_token = await _rematador(client, email)
    r = await client.post(
        REMATES_URL,
        json={
            "title": "Remate para runner de bots",
            "category": "hacienda",
            "starts_at": "2027-06-01T10:00:00Z",
        },
        headers=_auth(owner_token),
    )
    assert r.status_code == 201, r.text
    remate = r.json()

    payload = {
        "lot_number": "1",
        "title": "Toro Angus",
        "category": "hacienda",
        "base_price": "1000.00",
        "min_increment": "100.00",
    }
    payload.update(lote_overrides)
    r = await client.post(f"{REMATES_URL}/{remate['id']}/lotes", json=payload, headers=_auth(owner_token))
    assert r.status_code == 201, r.text
    lote = r.json()

    r = await client.post(f"{REMATES_URL}/{remate['id']}/schedule", headers=_auth(owner_token))
    assert r.status_code == 200, r.text
    r = await client.post(f"{REMATES_URL}/{remate['id']}/start", headers=_auth(owner_token))
    assert r.status_code == 200, r.text
    r = await client.post(
        f"{REMATES_URL}/{remate['id']}/lotes/{lote['id']}/open", headers=_auth(owner_token)
    )
    assert r.status_code == 200, r.text

    return owner_id, remate["id"], lote["id"], Decimal(lote["base_price"]), Decimal(lote["min_increment"])


async def _create_selected_bot(
    db_session: AsyncSession, owner_id: str, remate_id: str, **overrides
) -> User:
    bot_user = User(
        email=f"bot+{uuid.uuid4()}@bots.rematar.internal",
        hashed_password=hash_password("unused"),
        full_name=overrides.get("display_name", "Bot de prueba"),
        role=UserRole.COMPRADOR,
    )
    db_session.add(bot_user)
    await db_session.commit()
    await db_session.refresh(bot_user)

    profile = BotProfile(
        created_by_id=uuid.UUID(owner_id),
        user_id=bot_user.id,
        display_name=overrides.get("display_name", "Bot de prueba"),
        personality=overrides.get("personality", BotPersonality.AGGRESSIVE),
        max_budget=overrides.get("max_budget", Decimal("100000.00")),
        reaction_delay_min_seconds=overrides.get("reaction_delay_min_seconds", 1),
        reaction_delay_max_seconds=overrides.get("reaction_delay_max_seconds", 1),
        continue_probability=overrides.get("continue_probability", Decimal("1.00")),
        participates_in_chat=overrides.get("participates_in_chat", False),
        chat_message_frequency=overrides.get("chat_message_frequency", Decimal("0")),
    )
    db_session.add(profile)
    await db_session.commit()
    await db_session.refresh(profile)

    db_session.add(
        BotRemateSelection(remate_id=uuid.UUID(remate_id), bot_profile_id=profile.id, is_enabled=True)
    )
    await db_session.commit()

    return bot_user


def _make_registry(db_engine: AsyncEngine, redis_client: Redis) -> BotRunnerRegistry:
    session_factory = async_sessionmaker(bind=db_engine, expire_on_commit=False)
    return BotRunnerRegistry(
        session_factory, _RecordingEventBus(), RedisRateLimiter(redis_client), get_settings()
    )


async def _offers_for_buyer(db_engine: AsyncEngine, lote_id: str, buyer_id: uuid.UUID) -> list[Oferta]:
    session_factory = async_sessionmaker(bind=db_engine, expire_on_commit=False)
    async with session_factory() as session:
        stmt = (
            select(Oferta)
            .where(Oferta.lote_id == uuid.UUID(lote_id), Oferta.buyer_id == buyer_id)
            .order_by(Oferta.created_at.asc())
        )
        return list((await session.execute(stmt)).scalars().all())


async def _chat_messages_for_author(
    db_engine: AsyncEngine, remate_id: str, author_id: uuid.UUID
) -> list[ChatMessage]:
    session_factory = async_sessionmaker(bind=db_engine, expire_on_commit=False)
    async with session_factory() as session:
        stmt = select(ChatMessage).where(
            ChatMessage.remate_id == uuid.UUID(remate_id), ChatMessage.author_id == author_id
        )
        return list((await session.execute(stmt)).scalars().all())


# --- El bot oferta a través del motor real ------------------------------------------------


async def test_bot_places_accepted_bid_via_real_auction_engine(
    client: AsyncClient, db_session: AsyncSession, db_engine: AsyncEngine, redis_client: Redis
) -> None:
    owner_id, remate_id, lote_id, base_price, _min_increment = await _setup_open_lote(
        client, "runner-bid1@example.com"
    )
    bot_user = await _create_selected_bot(db_session, owner_id, remate_id)

    registry = _make_registry(db_engine, redis_client)
    await registry.start(uuid.UUID(remate_id), uuid.UUID(lote_id))
    await asyncio.sleep(1.4)

    offers = await _offers_for_buyer(db_engine, lote_id, bot_user.id)
    assert len(offers) == 1
    assert offers[0].status == OfertaStatus.ACCEPTED
    assert offers[0].amount >= base_price


async def test_bot_does_not_bid_when_floor_exceeds_max_budget(
    client: AsyncClient, db_session: AsyncSession, db_engine: AsyncEngine, redis_client: Redis
) -> None:
    owner_id, remate_id, lote_id, base_price, _min_increment = await _setup_open_lote(
        client, "runner-bid2@example.com"
    )
    bot_user = await _create_selected_bot(
        db_session, owner_id, remate_id, max_budget=base_price - Decimal("1.00")
    )

    registry = _make_registry(db_engine, redis_client)
    await registry.start(uuid.UUID(remate_id), uuid.UUID(lote_id))
    await asyncio.sleep(1.4)

    offers = await _offers_for_buyer(db_engine, lote_id, bot_user.id)
    assert offers == []


# --- Cancelación de tareas -----------------------------------------------------------------


async def test_stop_cancels_pending_reaction_before_it_fires(
    client: AsyncClient, db_session: AsyncSession, db_engine: AsyncEngine, redis_client: Redis
) -> None:
    owner_id, remate_id, lote_id, _base_price, _min_increment = await _setup_open_lote(
        client, "runner-stop1@example.com"
    )
    bot_user = await _create_selected_bot(
        db_session, owner_id, remate_id, reaction_delay_min_seconds=2, reaction_delay_max_seconds=2
    )

    registry = _make_registry(db_engine, redis_client)
    await registry.start(uuid.UUID(remate_id), uuid.UUID(lote_id))
    await registry.stop(uuid.UUID(remate_id))  # detiene antes de que pase 1 solo segundo
    await asyncio.sleep(2.3)

    offers = await _offers_for_buyer(db_engine, lote_id, bot_user.id)
    assert offers == [], "una tarea cancelada no debe seguir generando una oferta"


async def test_lote_closed_cancels_pending_reaction(
    client: AsyncClient, db_session: AsyncSession, db_engine: AsyncEngine, redis_client: Redis
) -> None:
    owner_id, remate_id, lote_id, _base_price, _min_increment = await _setup_open_lote(
        client, "runner-close1@example.com"
    )
    bot_user = await _create_selected_bot(
        db_session, owner_id, remate_id, reaction_delay_min_seconds=2, reaction_delay_max_seconds=2
    )

    registry = _make_registry(db_engine, redis_client)
    await registry.start(uuid.UUID(remate_id), uuid.UUID(lote_id))
    await registry.notify_lote_closed(uuid.UUID(remate_id), uuid.UUID(lote_id))
    await asyncio.sleep(2.3)

    offers = await _offers_for_buyer(db_engine, lote_id, bot_user.id)
    assert offers == [], "no se puede ofertar sobre un lote que ya se cerró"


# --- Competencia entre varios bots ----------------------------------------------------------


async def test_two_bots_compete_with_increasing_offers_respecting_min_increment(
    client: AsyncClient, db_session: AsyncSession, db_engine: AsyncEngine, redis_client: Redis
) -> None:
    owner_id, remate_id, lote_id, base_price, min_increment = await _setup_open_lote(
        client, "runner-compete1@example.com"
    )
    # Bot A reacciona ~1s (primero); Bot B reacciona ~2s (después de ver la oferta de A) --
    # delays deliberadamente distintos para que el orden sea determinístico en el test.
    bot_a = await _create_selected_bot(
        db_session,
        owner_id,
        remate_id,
        display_name="Bot A",
        reaction_delay_min_seconds=1,
        reaction_delay_max_seconds=1,
    )
    bot_b = await _create_selected_bot(
        db_session,
        owner_id,
        remate_id,
        display_name="Bot B",
        reaction_delay_min_seconds=2,
        reaction_delay_max_seconds=2,
    )

    registry = _make_registry(db_engine, redis_client)
    await registry.start(uuid.UUID(remate_id), uuid.UUID(lote_id))
    await asyncio.sleep(2.4)

    offers_a = await _offers_for_buyer(db_engine, lote_id, bot_a.id)
    offers_b = await _offers_for_buyer(db_engine, lote_id, bot_b.id)
    # Bot A puja primero (~1s) y queda ACCEPTED momentáneamente; cuando Bot B lo supera
    # (~2s), el motor real transiciona esa oferta previa a OUTBID -- mismo
    # comportamiento que dos compradores humanos, ver `AuctionEngine.place_bid`.
    assert len(offers_a) == 1 and offers_a[0].status == OfertaStatus.OUTBID
    assert len(offers_b) == 1 and offers_b[0].status == OfertaStatus.ACCEPTED
    assert offers_a[0].amount >= base_price
    assert offers_b[0].amount >= offers_a[0].amount + min_increment


# --- Participación en el chat ----------------------------------------------------------------


async def test_bot_sends_chat_message_when_participation_enabled(
    client: AsyncClient, db_session: AsyncSession, db_engine: AsyncEngine, redis_client: Redis
) -> None:
    owner_id, remate_id, lote_id, _base_price, _min_increment = await _setup_open_lote(
        client, "runner-chat1@example.com"
    )
    bot_user = await _create_selected_bot(
        db_session,
        owner_id,
        remate_id,
        participates_in_chat=True,
        chat_message_frequency=Decimal("1.00"),
        reaction_delay_min_seconds=1,
        reaction_delay_max_seconds=1,
    )

    registry = _make_registry(db_engine, redis_client)
    await registry.start(uuid.UUID(remate_id), uuid.UUID(lote_id))
    await asyncio.sleep(1.4)

    messages = await _chat_messages_for_author(db_engine, remate_id, bot_user.id)
    assert len(messages) == 1
    assert messages[0].content
