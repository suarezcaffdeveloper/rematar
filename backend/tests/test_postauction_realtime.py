"""Tests de `PostAuctionEventDispatcher` (Épica 7, Módulo 7.5) -- llamado directamente
con el JSON crudo que produciría `EventBus.publish`, sin pasar por Redis Pub/Sub real ni
por el `EventConsumer`. Mismo criterio que `test_chat_realtime_system_messages.py`.
"""

import uuid
from decimal import Decimal

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker

from app.events.base import DomainEvent
from app.modules.remates.lotes.events import LoteWinnerDetermined
from app.notifications.models import Notification
from app.postauction.models import PostAuctionCase, PostAuctionStatus
from app.postauction.realtime import PostAuctionEventDispatcher

REGISTER_URL = "/api/v1/auth/register"
LOGIN_URL = "/api/v1/auth/login"
REMATES_URL = "/api/v1/remates"


class _RecordingEventBus:
    def __init__(self) -> None:
        self.published: list[DomainEvent] = []

    async def publish(self, event: DomainEvent) -> None:
        self.published.append(event)


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def _register(client: AsyncClient, *, email: str, role: str) -> tuple[str, uuid.UUID]:
    await client.post(
        REGISTER_URL,
        json={"email": email, "password": "password123", "full_name": "Test", "role": role},
    )
    login = await client.post(LOGIN_URL, data={"username": email, "password": "password123"})
    assert login.status_code == 200, login.text
    token = login.json()["access_token"]
    me = await client.get("/api/v1/users/me", headers=_auth(token))
    return token, uuid.UUID(me.json()["id"])


async def _setup_remate_and_lote(client: AsyncClient) -> tuple[uuid.UUID, uuid.UUID, uuid.UUID]:
    """Devuelve (remate_id, lote_id, buyer_id) reales -- `create_case_from_winner`
    resuelve estas tres filas antes de crear el caso, así que tienen que existir."""
    rematador_token, _ = await _register(
        client, email=f"remat{uuid.uuid4()}@example.com", role="rematador"
    )
    _, buyer_id = await _register(
        client, email=f"buyer{uuid.uuid4()}@example.com", role="comprador"
    )

    remate_response = await client.post(
        REMATES_URL,
        json={"title": "Remate de campo", "category": "hacienda"},
        headers=_auth(rematador_token),
    )
    assert remate_response.status_code == 201, remate_response.text
    remate_id = uuid.UUID(remate_response.json()["id"])

    lote_response = await client.post(
        f"{REMATES_URL}/{remate_id}/lotes",
        json={
            "lot_number": "1",
            "title": "Toro Angus",
            "category": "hacienda",
            "base_price": "1000",
            "min_increment": "100",
        },
        headers=_auth(rematador_token),
    )
    assert lote_response.status_code == 201, lote_response.text
    lote_id = uuid.UUID(lote_response.json()["id"])

    return remate_id, lote_id, buyer_id


def _make_dispatcher(
    db_engine: AsyncEngine, event_bus: _RecordingEventBus
) -> PostAuctionEventDispatcher:
    session_factory = async_sessionmaker(bind=db_engine, expire_on_commit=False)
    return PostAuctionEventDispatcher(session_factory, event_bus)


async def _only_case(db_engine: AsyncEngine) -> PostAuctionCase:
    session_factory = async_sessionmaker(bind=db_engine, expire_on_commit=False)
    async with session_factory() as session:
        rows = (await session.execute(select(PostAuctionCase))).scalars().all()
        assert len(rows) == 1, rows
        return rows[0]


async def test_lote_winner_determined_creates_case(
    client: AsyncClient, db_engine: AsyncEngine
) -> None:
    remate_id, lote_id, buyer_id = await _setup_remate_and_lote(client)
    event_bus = _RecordingEventBus()
    dispatcher = _make_dispatcher(db_engine, event_bus)
    event = LoteWinnerDetermined(
        remate_id=remate_id, lote_id=lote_id, oferta_id=uuid.uuid4(), buyer_id=buyer_id,
        amount=Decimal("1500"),
    )

    await dispatcher.dispatch(event.model_dump_json())

    case = await _only_case(db_engine)
    assert case.status == PostAuctionStatus.ADJUDICADO
    assert case.buyer_id == buyer_id
    assert case.final_price == Decimal("1500")
    assert len(event_bus.published) == 1
    assert event_bus.published[0].event_type == "postauction.case_created"


async def test_lote_winner_determined_creates_notifications(
    client: AsyncClient, db_engine: AsyncEngine
) -> None:
    remate_id, lote_id, buyer_id = await _setup_remate_and_lote(client)
    dispatcher = _make_dispatcher(db_engine, _RecordingEventBus())
    event = LoteWinnerDetermined(
        remate_id=remate_id, lote_id=lote_id, oferta_id=uuid.uuid4(), buyer_id=buyer_id,
        amount=Decimal("1500"),
    )

    await dispatcher.dispatch(event.model_dump_json())

    session_factory = async_sessionmaker(bind=db_engine, expire_on_commit=False)
    async with session_factory() as session:
        rows = (await session.execute(select(Notification))).scalars().all()
    assert len(rows) == 2
    recipients = {row.user_id for row in rows}
    assert buyer_id in recipients


async def test_ignores_event_types_outside_the_whitelist(
    client: AsyncClient, db_engine: AsyncEngine
) -> None:
    remate_id, lote_id, buyer_id = await _setup_remate_and_lote(client)
    event_bus = _RecordingEventBus()
    dispatcher = _make_dispatcher(db_engine, event_bus)

    await dispatcher.dispatch(
        f'{{"event_type": "lote.closed", "remate_id": "{remate_id}", "lote_id": "{lote_id}", '
        f'"outcome": "sold"}}'
    )

    session_factory = async_sessionmaker(bind=db_engine, expire_on_commit=False)
    async with session_factory() as session:
        rows = (await session.execute(select(PostAuctionCase))).scalars().all()
    assert rows == []
    assert event_bus.published == []


async def test_idempotent_when_the_same_event_is_dispatched_twice(
    client: AsyncClient, db_engine: AsyncEngine
) -> None:
    remate_id, lote_id, buyer_id = await _setup_remate_and_lote(client)
    event_bus = _RecordingEventBus()
    dispatcher_a = _make_dispatcher(db_engine, event_bus)
    dispatcher_b = _make_dispatcher(db_engine, event_bus)
    raw_payload = LoteWinnerDetermined(
        remate_id=remate_id, lote_id=lote_id, oferta_id=uuid.uuid4(), buyer_id=buyer_id,
        amount=Decimal("1500"),
    ).model_dump_json()

    await dispatcher_a.dispatch(raw_payload)
    await dispatcher_b.dispatch(raw_payload)

    case = await _only_case(db_engine)
    assert case.buyer_id == buyer_id


async def test_malformed_payload_does_not_raise(db_engine: AsyncEngine) -> None:
    dispatcher = _make_dispatcher(db_engine, _RecordingEventBus())

    await dispatcher.dispatch("esto no es JSON")
    await dispatcher.dispatch('{"event_type": "lote.winner_determined"}')  # sin ids


async def test_event_for_nonexistent_lote_does_not_raise(db_engine: AsyncEngine) -> None:
    dispatcher = _make_dispatcher(db_engine, _RecordingEventBus())
    event = LoteWinnerDetermined(
        remate_id=uuid.uuid4(), lote_id=uuid.uuid4(), oferta_id=uuid.uuid4(),
        buyer_id=uuid.uuid4(), amount=Decimal("100"),
    )

    await dispatcher.dispatch(event.model_dump_json())

    session_factory = async_sessionmaker(bind=db_engine, expire_on_commit=False)
    async with session_factory() as session:
        rows = (await session.execute(select(PostAuctionCase))).scalars().all()
    assert rows == []
