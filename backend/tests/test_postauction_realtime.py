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
from app.modules.remates.lotes.events import LoteClosed, LoteWinnerDetermined
from app.notifications.models import Notification
from app.notify.service import NotificationService
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


class _FakeNotificationChannel:
    """Ver `test_postauction_service.py::_FakeNotificationChannel` -- misma idea, acá a
    nivel dispatcher (evento crudo -> caso creado -> canal disparado), no a nivel
    servicio. `name` configurable para poder representar tanto el canal de email como
    el de WhatsApp con la misma clase."""

    def __init__(self, *, name: str = "email") -> None:
        self.name = name
        self.calls: list = []

    async def notify_lote_adjudicado(self, context) -> None:
        self.calls.append(context)


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def _register(client: AsyncClient, *, email: str, role: str) -> tuple[str, uuid.UUID]:
    await client.post(
        REGISTER_URL,
        json={
            "email": email,
            "password": "password123",
            "confirm_password": "password123",
            "full_name": "Test",
            "phone": "+5491122334455",
            "role": role,
        },
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


async def _setup_remate_lote_with_accepted_offer(
    client: AsyncClient, *, bid_amount: str = "1500"
) -> tuple[uuid.UUID, uuid.UUID, uuid.UUID]:
    """Igual que `_setup_remate_and_lote`, pero además programa/arranca el remate, abre
    el lote y hace que el comprador oferte de verdad -- deja una `Oferta` `ACCEPTED` real
    en la base, que es lo que el cierre manual (`lote.closed`) tiene que poder resolver.
    Devuelve (remate_id, lote_id, buyer_id)."""
    rematador_token, _ = await _register(
        client, email=f"remat{uuid.uuid4()}@example.com", role="rematador"
    )
    buyer_token, buyer_id = await _register(
        client, email=f"buyer{uuid.uuid4()}@example.com", role="comprador"
    )

    remate_response = await client.post(
        REMATES_URL,
        json={
            "title": "Remate de campo",
            "category": "hacienda",
            "starts_at": "2027-06-01T10:00:00Z",
        },
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

    schedule = await client.post(f"{REMATES_URL}/{remate_id}/schedule", headers=_auth(rematador_token))
    assert schedule.status_code == 200, schedule.text
    start = await client.post(f"{REMATES_URL}/{remate_id}/start", headers=_auth(rematador_token))
    assert start.status_code == 200, start.text
    open_response = await client.post(
        f"{REMATES_URL}/{remate_id}/lotes/{lote_id}/open", headers=_auth(rematador_token)
    )
    assert open_response.status_code == 200, open_response.text

    bid_response = await client.post(
        f"{REMATES_URL}/{remate_id}/lotes/{lote_id}/ofertas",
        json={"amount": bid_amount},
        headers=_auth(buyer_token),
    )
    assert bid_response.status_code == 201, bid_response.text

    return remate_id, lote_id, buyer_id


def _make_dispatcher(
    db_engine: AsyncEngine,
    event_bus: _RecordingEventBus,
    notification_service: NotificationService | None = None,
) -> PostAuctionEventDispatcher:
    session_factory = async_sessionmaker(bind=db_engine, expire_on_commit=False)
    return PostAuctionEventDispatcher(
        session_factory, event_bus, notification_service or NotificationService([])
    )


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


async def test_lote_winner_determined_triggers_email_notification(
    client: AsyncClient, db_engine: AsyncEngine
) -> None:
    remate_id, lote_id, buyer_id = await _setup_remate_and_lote(client)
    channel = _FakeNotificationChannel()
    dispatcher = _make_dispatcher(db_engine, _RecordingEventBus(), NotificationService([channel]))
    event = LoteWinnerDetermined(
        remate_id=remate_id, lote_id=lote_id, oferta_id=uuid.uuid4(), buyer_id=buyer_id,
        amount=Decimal("1500"),
    )

    await dispatcher.dispatch(event.model_dump_json())

    assert len(channel.calls) == 1
    assert channel.calls[0].lote_id == lote_id
    assert channel.calls[0].buyer_email is not None
    assert channel.calls[0].final_price == Decimal("1500")


async def test_lote_winner_determined_triggers_whatsapp_notification(
    client: AsyncClient, db_engine: AsyncEngine
) -> None:
    remate_id, lote_id, buyer_id = await _setup_remate_and_lote(client)
    channel = _FakeNotificationChannel(name="whatsapp")
    dispatcher = _make_dispatcher(db_engine, _RecordingEventBus(), NotificationService([channel]))
    event = LoteWinnerDetermined(
        remate_id=remate_id, lote_id=lote_id, oferta_id=uuid.uuid4(), buyer_id=buyer_id,
        amount=Decimal("1500"),
    )

    await dispatcher.dispatch(event.model_dump_json())

    assert len(channel.calls) == 1
    assert channel.calls[0].lote_id == lote_id
    assert channel.calls[0].buyer_phone is not None
    assert channel.calls[0].rematador_phone is not None
    assert channel.calls[0].final_price == Decimal("1500")


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
    remate_id, lote_id, _buyer_id = await _setup_remate_and_lote(client)
    event_bus = _RecordingEventBus()
    dispatcher = _make_dispatcher(db_engine, event_bus)

    await dispatcher.dispatch(
        f'{{"event_type": "lote.opened", "remate_id": "{remate_id}", "lote_id": "{lote_id}"}}'
    )

    session_factory = async_sessionmaker(bind=db_engine, expire_on_commit=False)
    async with session_factory() as session:
        rows = (await session.execute(select(PostAuctionCase))).scalars().all()
    assert rows == []
    assert event_bus.published == []


# --- Cierre manual (`lote.closed`) -- corrección del bug de adjudicación manual -----


async def test_lote_closed_manual_sold_with_real_offer_creates_case(
    client: AsyncClient, db_engine: AsyncEngine
) -> None:
    """El caso del bug reportado: el rematador cierra el lote a mano (no vence ningún
    timer) mientras el lote sí tiene una oferta `ACCEPTED` real -- antes de la
    corrección, esto no creaba ningún caso post-remate porque `LoteClosed` no trae
    `buyer_id` y el dispatcher solo reaccionaba a `lote.winner_determined` (que
    `LoteService.close()` nunca publica). El `final_price` del evento (lo que el
    rematador tipeó al cerrar) puede no coincidir centavo a centavo con el monto de la
    oferta líder -- el caso usa el `final_price` del evento, el comprador se resuelve
    por la oferta líder real."""
    remate_id, lote_id, buyer_id = await _setup_remate_lote_with_accepted_offer(
        client, bid_amount="1500"
    )
    event_bus = _RecordingEventBus()
    dispatcher = _make_dispatcher(db_engine, event_bus)
    event = LoteClosed(
        remate_id=remate_id,
        lote_id=lote_id,
        outcome="sold",
        final_price=Decimal("1500"),
        triggered_by="manual",
    )

    await dispatcher.dispatch(event.model_dump_json())

    case = await _only_case(db_engine)
    assert case.status == PostAuctionStatus.ADJUDICADO
    assert case.buyer_id == buyer_id
    assert case.final_price == Decimal("1500")
    assert len(event_bus.published) == 1
    assert event_bus.published[0].event_type == "postauction.case_created"


async def test_lote_closed_manual_sold_without_any_offer_creates_nothing(
    client: AsyncClient, db_engine: AsyncEngine
) -> None:
    """Escenario original de ADR-018 -- el rematador declara una venta sin ninguna
    oferta real asociada (por fuera del sistema): sin comprador real, sigue sin
    generar un caso. No es un bug."""
    remate_id, lote_id, _buyer_id = await _setup_remate_and_lote(client)
    event_bus = _RecordingEventBus()
    channel = _FakeNotificationChannel()
    dispatcher = _make_dispatcher(db_engine, event_bus, NotificationService([channel]))
    event = LoteClosed(
        remate_id=remate_id,
        lote_id=lote_id,
        outcome="sold",
        final_price=Decimal("1500"),
        triggered_by="manual",
    )

    await dispatcher.dispatch(event.model_dump_json())

    session_factory = async_sessionmaker(bind=db_engine, expire_on_commit=False)
    async with session_factory() as session:
        rows = (await session.execute(select(PostAuctionCase))).scalars().all()
    assert rows == []
    assert event_bus.published == []
    assert channel.calls == []  # sin comprador real, no hay ganador a quien avisarle


async def test_lote_closed_manual_unsold_creates_nothing(
    client: AsyncClient, db_engine: AsyncEngine
) -> None:
    remate_id, lote_id, _buyer_id = await _setup_remate_lote_with_accepted_offer(client)
    event_bus = _RecordingEventBus()
    channel = _FakeNotificationChannel()
    dispatcher = _make_dispatcher(db_engine, event_bus, NotificationService([channel]))
    event = LoteClosed(
        remate_id=remate_id, lote_id=lote_id, outcome="unsold", final_price=None, triggered_by="manual"
    )

    await dispatcher.dispatch(event.model_dump_json())

    session_factory = async_sessionmaker(bind=db_engine, expire_on_commit=False)
    async with session_factory() as session:
        rows = (await session.execute(select(PostAuctionCase))).scalars().all()
    assert rows == []
    assert channel.calls == []  # lote cerrado sin comprador -- no se envía email


async def test_lote_closed_auto_sold_is_ignored_here(
    client: AsyncClient, db_engine: AsyncEngine
) -> None:
    """El cierre automático ya adjudica vía su propio `lote.winner_determined`
    (`test_lote_winner_determined_creates_case`) -- si el dispatcher también procesara
    el `lote.closed` `auto` correspondiente, sería trabajo redundante (inofensivo por
    idempotencia, pero innecesario). Se verifica acá que no hace nada por su cuenta."""
    remate_id, lote_id, _buyer_id = await _setup_remate_lote_with_accepted_offer(client)
    event_bus = _RecordingEventBus()
    dispatcher = _make_dispatcher(db_engine, event_bus)
    event = LoteClosed(
        remate_id=remate_id,
        lote_id=lote_id,
        outcome="sold",
        final_price=Decimal("1500"),
        triggered_by="auto",
    )

    await dispatcher.dispatch(event.model_dump_json())

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
    channel = _FakeNotificationChannel()
    notification_service = NotificationService([channel])
    dispatcher_a = _make_dispatcher(db_engine, event_bus, notification_service)
    dispatcher_b = _make_dispatcher(db_engine, event_bus, notification_service)
    raw_payload = LoteWinnerDetermined(
        remate_id=remate_id, lote_id=lote_id, oferta_id=uuid.uuid4(), buyer_id=buyer_id,
        amount=Decimal("1500"),
    ).model_dump_json()

    await dispatcher_a.dispatch(raw_payload)
    await dispatcher_b.dispatch(raw_payload)

    case = await _only_case(db_engine)
    assert case.buyer_id == buyer_id
    # Dos dispatchers procesando el mismo evento -- el email solo se manda una vez,
    # nunca dos, por la idempotencia de `create_case_from_winner` sobre `lote_id`.
    assert len(channel.calls) == 1


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
