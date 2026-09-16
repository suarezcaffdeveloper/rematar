"""Tests de `GarantiaEventDispatcher` -- Fase 5 del plan de Garantía Económica. Llamado
directamente con el JSON crudo que produciría `EventBus.publish` (mismo criterio que
`test_postauction_realtime.py`), sin pasar por Redis Pub/Sub real ni por el
`EventConsumer`.
"""

import uuid
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.core.config import get_settings
from app.core.security import hash_password
from app.events.base import DomainEvent
from app.modules.garantias.mercadopago_client import MercadoPagoPaymentResult
from app.modules.garantias.models import Garantia, GarantiaStatus
from app.modules.garantias.realtime import GarantiaEventDispatcher
from app.modules.remates.events import RemateCancelled, RemateFinished
from app.modules.remates.models import Remate, RemateCategory, RemateStatus
from app.modules.users.models import User, UserRole
from app.postauction.events import PostAuctionCaseCreated


class _RecordingEventBus:
    def __init__(self) -> None:
        self.published: list[DomainEvent] = []

    async def publish(self, event: DomainEvent) -> None:
        self.published.append(event)


class _FakeMercadoPagoClient:
    def __init__(self) -> None:
        self.calls: list[tuple[str, dict]] = []

    async def create_hold(self, **kwargs) -> MercadoPagoPaymentResult:
        raise NotImplementedError

    async def capture(self, payment_id: str, *, amount=None) -> MercadoPagoPaymentResult:
        self.calls.append(("capture", {"payment_id": payment_id, "amount": amount}))
        return MercadoPagoPaymentResult(
            payment_id=payment_id, status="approved", status_detail=None, raw={}
        )

    async def cancel(self, payment_id: str) -> MercadoPagoPaymentResult:
        self.calls.append(("cancel", {"payment_id": payment_id}))
        return MercadoPagoPaymentResult(
            payment_id=payment_id, status="cancelled", status_detail=None, raw={}
        )

    async def get_status(self, payment_id: str) -> MercadoPagoPaymentResult:
        raise NotImplementedError


async def _create_user(db_session: AsyncSession, *, role: UserRole) -> User:
    user = User(
        email=f"{uuid.uuid4()}@example.com",
        hashed_password=hash_password("password123"),
        full_name="Usuario de prueba",
        role=role,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


async def _create_remate(db_session: AsyncSession, owner: User) -> Remate:
    remate = Remate(
        owner_id=owner.id,
        title="Remate campo",
        category=RemateCategory.HACIENDA,
        status=RemateStatus.LIVE,
    )
    db_session.add(remate)
    await db_session.commit()
    await db_session.refresh(remate)
    return remate


async def _create_active_garantia(
    db_session: AsyncSession, *, remate: Remate, buyer: User, mp_payment_id: str = "mp-rt-1"
) -> Garantia:
    garantia = Garantia(
        remate_id=remate.id,
        buyer_id=buyer.id,
        status=GarantiaStatus.ACTIVE,
        amount=Decimal("50000.00"),
        currency="ARS",
        mp_payment_id=mp_payment_id,
    )
    db_session.add(garantia)
    await db_session.commit()
    await db_session.refresh(garantia)
    return garantia


def _make_dispatcher(
    db_engine: AsyncEngine, mp_client: _FakeMercadoPagoClient
) -> GarantiaEventDispatcher:
    session_factory = async_sessionmaker(bind=db_engine, expire_on_commit=False)
    return GarantiaEventDispatcher(
        session_factory, _RecordingEventBus(), mp_client, get_settings()
    )


async def test_postauction_case_created_captures_active_garantia(
    db_session: AsyncSession, db_engine: AsyncEngine
) -> None:
    owner = await _create_user(db_session, role=UserRole.EMPRESA)
    buyer = await _create_user(db_session, role=UserRole.COMPRADOR)
    remate = await _create_remate(db_session, owner)
    garantia = await _create_active_garantia(db_session, remate=remate, buyer=buyer)

    mp_client = _FakeMercadoPagoClient()
    dispatcher = _make_dispatcher(db_engine, mp_client)
    event = PostAuctionCaseCreated(
        remate_id=remate.id, case_id=uuid.uuid4(), lote_id=uuid.uuid4(), buyer_id=buyer.id
    )

    await dispatcher.dispatch(event.model_dump_json())

    await db_session.refresh(garantia)
    assert garantia.status == GarantiaStatus.CAPTURED
    assert garantia.captured_amount == garantia.amount
    assert ("capture", {"payment_id": "mp-rt-1", "amount": None}) in mp_client.calls


async def test_postauction_case_created_ignores_when_no_garantia(
    db_session: AsyncSession, db_engine: AsyncEngine
) -> None:
    owner = await _create_user(db_session, role=UserRole.EMPRESA)
    buyer = await _create_user(db_session, role=UserRole.COMPRADOR)
    remate = await _create_remate(db_session, owner)

    mp_client = _FakeMercadoPagoClient()
    dispatcher = _make_dispatcher(db_engine, mp_client)
    event = PostAuctionCaseCreated(
        remate_id=remate.id, case_id=uuid.uuid4(), lote_id=uuid.uuid4(), buyer_id=buyer.id
    )

    await dispatcher.dispatch(event.model_dump_json())  # no debe lanzar

    assert mp_client.calls == []


async def test_postauction_case_created_ignores_non_active_garantia(
    db_session: AsyncSession, db_engine: AsyncEngine
) -> None:
    owner = await _create_user(db_session, role=UserRole.EMPRESA)
    buyer = await _create_user(db_session, role=UserRole.COMPRADOR)
    remate = await _create_remate(db_session, owner)
    garantia = Garantia(
        remate_id=remate.id,
        buyer_id=buyer.id,
        status=GarantiaStatus.FAILED,
        amount=Decimal("50000.00"),
        currency="ARS",
        failure_reason="tarjeta rechazada",
    )
    db_session.add(garantia)
    await db_session.commit()

    mp_client = _FakeMercadoPagoClient()
    dispatcher = _make_dispatcher(db_engine, mp_client)
    event = PostAuctionCaseCreated(
        remate_id=remate.id, case_id=uuid.uuid4(), lote_id=uuid.uuid4(), buyer_id=buyer.id
    )

    await dispatcher.dispatch(event.model_dump_json())

    await db_session.refresh(garantia)
    assert garantia.status == GarantiaStatus.FAILED
    assert mp_client.calls == []


async def test_remate_finished_releases_active_garantias(
    db_session: AsyncSession, db_engine: AsyncEngine
) -> None:
    owner = await _create_user(db_session, role=UserRole.EMPRESA)
    buyer = await _create_user(db_session, role=UserRole.COMPRADOR)
    remate = await _create_remate(db_session, owner)
    garantia = await _create_active_garantia(db_session, remate=remate, buyer=buyer)

    mp_client = _FakeMercadoPagoClient()
    dispatcher = _make_dispatcher(db_engine, mp_client)
    event = RemateFinished(remate_id=remate.id, triggered_by="auto")

    await dispatcher.dispatch(event.model_dump_json())

    await db_session.refresh(garantia)
    assert garantia.status == GarantiaStatus.RELEASED
    assert garantia.release_reason == "no_ganador"
    assert ("cancel", {"payment_id": "mp-rt-1"}) in mp_client.calls


async def test_remate_cancelled_releases_active_garantias(
    db_session: AsyncSession, db_engine: AsyncEngine
) -> None:
    owner = await _create_user(db_session, role=UserRole.EMPRESA)
    buyer = await _create_user(db_session, role=UserRole.COMPRADOR)
    remate = await _create_remate(db_session, owner)
    garantia = await _create_active_garantia(db_session, remate=remate, buyer=buyer)

    mp_client = _FakeMercadoPagoClient()
    dispatcher = _make_dispatcher(db_engine, mp_client)
    event = RemateCancelled(remate_id=remate.id, reason="motivo de prueba")

    await dispatcher.dispatch(event.model_dump_json())

    await db_session.refresh(garantia)
    assert garantia.status == GarantiaStatus.RELEASED
    assert garantia.release_reason == "remate_cancelado"


async def test_remate_finished_ignores_when_none_active(
    db_session: AsyncSession, db_engine: AsyncEngine
) -> None:
    owner = await _create_user(db_session, role=UserRole.EMPRESA)
    remate = await _create_remate(db_session, owner)

    mp_client = _FakeMercadoPagoClient()
    dispatcher = _make_dispatcher(db_engine, mp_client)
    event = RemateFinished(remate_id=remate.id, triggered_by="manual")

    await dispatcher.dispatch(event.model_dump_json())  # no debe lanzar

    assert mp_client.calls == []


async def test_dispatch_ignores_malformed_or_unknown_events(db_engine: AsyncEngine) -> None:
    mp_client = _FakeMercadoPagoClient()
    dispatcher = _make_dispatcher(db_engine, mp_client)

    await dispatcher.dispatch("esto no es JSON")
    await dispatcher.dispatch('{"event_type": "remate.finished"}')  # sin remate_id
    # evento no reconocido -- ignorado
    await dispatcher.dispatch('{"event_type": "oferta.rejected", "remate_id": "x"}')

    assert mp_client.calls == []
