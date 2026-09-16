"""Tests de `GarantiaService` -- Fase 2 del plan de Garantía Económica. Contra Postgres
real (mismo criterio que el resto del proyecto), con el adapter de Mercado Pago
mockeado (`_FakeMercadoPagoClient`) -- nunca se llama a la API real de Mercado Pago
desde un test.
"""

import uuid
from datetime import timedelta
from decimal import Decimal

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit.repository import AuditLogRepository
from app.core.config import get_settings
from app.core.exceptions import BusinessRuleError, ForbiddenError
from app.core.security import hash_password
from app.events.base import DomainEvent
from app.modules.garantias.mercadopago_client import MercadoPagoError, MercadoPagoPaymentResult
from app.modules.garantias.models import GarantiaStatus
from app.modules.garantias.repository import GarantiaRepository
from app.modules.garantias.service import GarantiaService
from app.modules.remates.lotes.repository import LoteRepository
from app.modules.remates.models import DEFAULT_REMATE_SETTINGS, Remate, RemateCategory, RemateStatus
from app.modules.remates.repository import RemateRepository
from app.modules.remates.service import RemateService
from app.modules.users.models import User, UserRole


class _RecordingEventBus:
    def __init__(self) -> None:
        self.published: list[DomainEvent] = []

    async def publish(self, event: DomainEvent) -> None:
        self.published.append(event)


class _FakeMercadoPagoClient:
    def __init__(self) -> None:
        self.calls: list[tuple[str, dict]] = []
        self.create_hold_result: MercadoPagoPaymentResult | MercadoPagoError = (
            MercadoPagoPaymentResult(
                payment_id="mp-1", status="authorized", status_detail=None, raw={"id": "mp-1"}
            )
        )
        self.capture_result = MercadoPagoPaymentResult(
            payment_id="mp-1", status="approved", status_detail=None, raw={"id": "mp-1"}
        )
        self.cancel_result = MercadoPagoPaymentResult(
            payment_id="mp-1", status="cancelled", status_detail=None, raw={"id": "mp-1"}
        )
        self.get_status_result = self.create_hold_result

    async def create_hold(self, **kwargs) -> MercadoPagoPaymentResult:
        self.calls.append(("create_hold", kwargs))
        if isinstance(self.create_hold_result, Exception):
            raise self.create_hold_result
        return self.create_hold_result

    async def capture(self, payment_id: str, *, amount=None) -> MercadoPagoPaymentResult:
        self.calls.append(("capture", {"payment_id": payment_id, "amount": amount}))
        return self.capture_result

    async def cancel(self, payment_id: str) -> MercadoPagoPaymentResult:
        self.calls.append(("cancel", {"payment_id": payment_id}))
        return self.cancel_result

    async def get_status(self, payment_id: str) -> MercadoPagoPaymentResult:
        self.calls.append(("get_status", {"payment_id": payment_id}))
        return self.get_status_result


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


async def _create_remate(
    db_session: AsyncSession,
    owner: User,
    *,
    guarantee_required: bool = True,
    guarantee_amount: str | None = "50000.00",
) -> Remate:
    settings = {
        **DEFAULT_REMATE_SETTINGS,
        "guarantee_required": guarantee_required,
        "guarantee_amount": guarantee_amount,
    }
    remate = Remate(
        owner_id=owner.id,
        title="Remate campo",
        category=RemateCategory.HACIENDA,
        settings=settings,
        # SCHEDULED, no el DRAFT por defecto -- `RemateService.get_visible_or_raise`
        # (que `GarantiaService.create_or_retry` reutiliza) solo deja ver un DRAFT a su
        # dueño/operador, nunca a un comprador ajeno (ver `_is_visible`).
        status=RemateStatus.SCHEDULED,
    )
    db_session.add(remate)
    await db_session.commit()
    await db_session.refresh(remate)
    return remate


def _make_service(
    db_session: AsyncSession, mp_client: _FakeMercadoPagoClient
) -> GarantiaService:
    remate_service = RemateService(
        RemateRepository(db_session),
        LoteRepository(db_session),
        _RecordingEventBus(),
        AuditLogRepository(db_session),
    )
    return GarantiaService(
        GarantiaRepository(db_session), remate_service, mp_client, get_settings()
    )


async def test_create_or_retry_rejects_non_buyer(db_session: AsyncSession) -> None:
    owner = await _create_user(db_session, role=UserRole.EMPRESA)
    remate = await _create_remate(db_session, owner)
    mp_client = _FakeMercadoPagoClient()
    service = _make_service(db_session, mp_client)

    with pytest.raises(ForbiddenError):
        await service.create_or_retry(remate_id=remate.id, buyer=owner, card_payment_data={})


async def test_create_or_retry_rejects_when_guarantee_not_required(
    db_session: AsyncSession,
) -> None:
    owner = await _create_user(db_session, role=UserRole.EMPRESA)
    buyer = await _create_user(db_session, role=UserRole.COMPRADOR)
    remate = await _create_remate(
        db_session, owner, guarantee_required=False, guarantee_amount=None
    )
    mp_client = _FakeMercadoPagoClient()
    service = _make_service(db_session, mp_client)

    with pytest.raises(BusinessRuleError):
        await service.create_or_retry(remate_id=remate.id, buyer=buyer, card_payment_data={})


async def test_create_or_retry_success_sets_active_with_expiry(db_session: AsyncSession) -> None:
    owner = await _create_user(db_session, role=UserRole.EMPRESA)
    buyer = await _create_user(db_session, role=UserRole.COMPRADOR)
    remate = await _create_remate(db_session, owner)
    mp_client = _FakeMercadoPagoClient()
    service = _make_service(db_session, mp_client)

    garantia = await service.create_or_retry(
        remate_id=remate.id, buyer=buyer, card_payment_data={"token": "card-token"}
    )

    assert garantia.status == GarantiaStatus.ACTIVE
    assert garantia.mp_payment_id == "mp-1"
    assert garantia.amount == Decimal("50000.00")
    assert garantia.authorized_at is not None
    assert garantia.expires_at is not None
    expected_expiry = garantia.authorized_at + timedelta(
        days=get_settings().MERCADOPAGO_HOLD_VALIDITY_DAYS
    )
    assert abs((garantia.expires_at - expected_expiry).total_seconds()) < 1
    assert mp_client.calls[0][0] == "create_hold"


async def test_create_or_retry_marks_failed_on_mercadopago_error(db_session: AsyncSession) -> None:
    owner = await _create_user(db_session, role=UserRole.EMPRESA)
    buyer = await _create_user(db_session, role=UserRole.COMPRADOR)
    remate = await _create_remate(db_session, owner)
    mp_client = _FakeMercadoPagoClient()
    mp_client.create_hold_result = MercadoPagoError("tarjeta rechazada")
    service = _make_service(db_session, mp_client)

    garantia = await service.create_or_retry(remate_id=remate.id, buyer=buyer, card_payment_data={})

    assert garantia.status == GarantiaStatus.FAILED
    assert garantia.failure_reason == "tarjeta rechazada"


async def test_create_or_retry_marks_failed_on_rejected_status(db_session: AsyncSession) -> None:
    owner = await _create_user(db_session, role=UserRole.EMPRESA)
    buyer = await _create_user(db_session, role=UserRole.COMPRADOR)
    remate = await _create_remate(db_session, owner)
    mp_client = _FakeMercadoPagoClient()
    mp_client.create_hold_result = MercadoPagoPaymentResult(
        payment_id="mp-2",
        status="rejected",
        status_detail="cc_rejected_insufficient_amount",
        raw={},
    )
    service = _make_service(db_session, mp_client)

    garantia = await service.create_or_retry(remate_id=remate.id, buyer=buyer, card_payment_data={})

    assert garantia.status == GarantiaStatus.FAILED
    assert garantia.mp_payment_id == "mp-2"


async def test_create_or_retry_is_idempotent_while_active(db_session: AsyncSession) -> None:
    owner = await _create_user(db_session, role=UserRole.EMPRESA)
    buyer = await _create_user(db_session, role=UserRole.COMPRADOR)
    remate = await _create_remate(db_session, owner)
    mp_client = _FakeMercadoPagoClient()
    service = _make_service(db_session, mp_client)

    first = await service.create_or_retry(remate_id=remate.id, buyer=buyer, card_payment_data={})
    second = await service.create_or_retry(remate_id=remate.id, buyer=buyer, card_payment_data={})

    assert first.id == second.id
    assert len(mp_client.calls) == 1  # segunda llamada no volvió a golpear a Mercado Pago.


async def test_create_or_retry_reuses_row_after_failure(db_session: AsyncSession) -> None:
    owner = await _create_user(db_session, role=UserRole.EMPRESA)
    buyer = await _create_user(db_session, role=UserRole.COMPRADOR)
    remate = await _create_remate(db_session, owner)
    mp_client = _FakeMercadoPagoClient()
    mp_client.create_hold_result = MercadoPagoError("timeout")
    service = _make_service(db_session, mp_client)

    failed = await service.create_or_retry(remate_id=remate.id, buyer=buyer, card_payment_data={})
    assert failed.status == GarantiaStatus.FAILED

    mp_client.create_hold_result = MercadoPagoPaymentResult(
        payment_id="mp-3", status="authorized", status_detail=None, raw={}
    )
    retried = await service.create_or_retry(remate_id=remate.id, buyer=buyer, card_payment_data={})

    assert retried.id == failed.id  # misma fila, no una segunda (unique remate_id+buyer_id).
    assert retried.status == GarantiaStatus.ACTIVE
    assert retried.failure_reason is None


async def test_assert_active_or_raise(db_session: AsyncSession) -> None:
    owner = await _create_user(db_session, role=UserRole.EMPRESA)
    buyer = await _create_user(db_session, role=UserRole.COMPRADOR)
    remate = await _create_remate(db_session, owner)
    mp_client = _FakeMercadoPagoClient()
    service = _make_service(db_session, mp_client)

    with pytest.raises(ForbiddenError):
        await service.assert_active_or_raise(remate.id, buyer.id)

    await service.create_or_retry(remate_id=remate.id, buyer=buyer, card_payment_data={})
    await service.assert_active_or_raise(remate.id, buyer.id)  # no debe lanzar.


async def test_release_cancels_and_marks_released(db_session: AsyncSession) -> None:
    owner = await _create_user(db_session, role=UserRole.EMPRESA)
    buyer = await _create_user(db_session, role=UserRole.COMPRADOR)
    remate = await _create_remate(db_session, owner)
    mp_client = _FakeMercadoPagoClient()
    service = _make_service(db_session, mp_client)
    garantia = await service.create_or_retry(remate_id=remate.id, buyer=buyer, card_payment_data={})

    released = await service.release(garantia, reason="no_ganador")

    assert released.status == GarantiaStatus.RELEASED
    assert released.release_reason == "no_ganador"
    assert released.released_at is not None
    assert ("cancel", {"payment_id": "mp-1"}) in mp_client.calls


async def test_release_is_idempotent_for_non_active(db_session: AsyncSession) -> None:
    owner = await _create_user(db_session, role=UserRole.EMPRESA)
    buyer = await _create_user(db_session, role=UserRole.COMPRADOR)
    remate = await _create_remate(db_session, owner)
    mp_client = _FakeMercadoPagoClient()
    mp_client.create_hold_result = MercadoPagoError("nope")
    service = _make_service(db_session, mp_client)
    garantia = await service.create_or_retry(remate_id=remate.id, buyer=buyer, card_payment_data={})
    assert garantia.status == GarantiaStatus.FAILED

    result = await service.release(garantia, reason="no_ganador")

    assert result.status == GarantiaStatus.FAILED  # sin cambios.
    assert all(call[0] != "cancel" for call in mp_client.calls)


async def test_capture_full_amount_by_default(db_session: AsyncSession) -> None:
    owner = await _create_user(db_session, role=UserRole.EMPRESA)
    buyer = await _create_user(db_session, role=UserRole.COMPRADOR)
    remate = await _create_remate(db_session, owner)
    mp_client = _FakeMercadoPagoClient()
    service = _make_service(db_session, mp_client)
    garantia = await service.create_or_retry(remate_id=remate.id, buyer=buyer, card_payment_data={})

    captured = await service.capture(garantia)

    assert captured.status == GarantiaStatus.CAPTURED
    assert captured.captured_amount == garantia.amount
    assert captured.captured_at is not None
    assert ("capture", {"payment_id": "mp-1", "amount": None}) in mp_client.calls


async def test_reconcile_updates_pending_to_active(db_session: AsyncSession) -> None:
    owner = await _create_user(db_session, role=UserRole.EMPRESA)
    buyer = await _create_user(db_session, role=UserRole.COMPRADOR)
    remate = await _create_remate(db_session, owner)
    mp_client = _FakeMercadoPagoClient()
    mp_client.create_hold_result = MercadoPagoPaymentResult(
        payment_id="mp-4", status="pending", status_detail=None, raw={}
    )
    service = _make_service(db_session, mp_client)
    garantia = await service.create_or_retry(remate_id=remate.id, buyer=buyer, card_payment_data={})
    assert garantia.status == GarantiaStatus.PENDING_AUTHORIZATION

    mp_client.get_status_result = MercadoPagoPaymentResult(
        payment_id="mp-4", status="authorized", status_detail=None, raw={}
    )
    reconciled = await service.reconcile(garantia)

    assert reconciled.status == GarantiaStatus.ACTIVE
    assert reconciled.authorized_at is not None


async def test_reconcile_skips_terminal_garantias(db_session: AsyncSession) -> None:
    owner = await _create_user(db_session, role=UserRole.EMPRESA)
    buyer = await _create_user(db_session, role=UserRole.COMPRADOR)
    remate = await _create_remate(db_session, owner)
    mp_client = _FakeMercadoPagoClient()
    service = _make_service(db_session, mp_client)
    garantia = await service.create_or_retry(remate_id=remate.id, buyer=buyer, card_payment_data={})
    await service.release(garantia, reason="no_ganador")
    mp_client.calls.clear()

    await service.reconcile(garantia)

    assert mp_client.calls == []  # ya terminal (RELEASED), no vuelve a golpear a MP.
