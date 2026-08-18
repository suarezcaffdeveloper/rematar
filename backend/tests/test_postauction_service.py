"""Tests de `PostAuctionService` (Épica 7, Módulo 7.5), llamado directamente (sin pasar
por HTTP) contra Postgres real -- mismo criterio que el resto de la suite de tests de
servicio (ver `test_monitoring_service.py`).

Remate/Lote/User se construyen directo vía `db_session` (no a través del flujo completo
de puja/timer): lo que se está probando acá es el PostAuction Service en sí, no el
Auction Engine -- `test_postauction_realtime.py` cubre el enganche real con el evento
`lote.winner_determined`.
"""

import uuid
from decimal import Decimal

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit.repository import AuditLogRepository
from app.core.exceptions import BusinessRuleError, ForbiddenError, NotFoundError
from app.core.security import hash_password
from app.modules.remates.lotes.models import Lote
from app.modules.remates.lotes.repository import LoteRepository
from app.modules.remates.models import Remate, RemateCategory
from app.modules.remates.repository import RemateRepository
from app.modules.users.models import User, UserRole
from app.modules.users.repository import UserRepository
from app.notifications.repository import NotificationRepository
from app.notify.service import NotificationService
from app.postauction.models import PostAuctionStatus
from app.postauction.repository import PostAuctionRepository
from app.postauction.service import PostAuctionService


class _RecordingEventBus:
    def __init__(self) -> None:
        self.events: list = []

    async def publish(self, event) -> None:
        self.events.append(event)


class _FakeNotificationChannel:
    """`NotificationChannel` de test -- registra los contextos recibidos en vez de
    mandar una notificación de verdad. `should_fail` simula un proveedor caído (SMTP,
    Meta Cloud API), para probar que `NotificationService`/`create_case_from_winner` lo
    absorben sin romper la adjudicación. `name` configurable para poder representar
    tanto el canal de email como el de WhatsApp con la misma clase."""

    def __init__(self, *, name: str = "email", should_fail: bool = False) -> None:
        self.name = name
        self.should_fail = should_fail
        self.calls: list = []

    async def notify_lote_adjudicado(self, context) -> None:
        self.calls.append(context)
        if self.should_fail:
            raise RuntimeError("SMTP no disponible (simulado)")





def _make_service(
    db_session: AsyncSession,
    event_bus: _RecordingEventBus,
    notification_service: NotificationService | None = None,
) -> PostAuctionService:
    return PostAuctionService(
        PostAuctionRepository(db_session),
        RemateRepository(db_session),
        LoteRepository(db_session),
        UserRepository(db_session),
        AuditLogRepository(db_session),
        NotificationRepository(db_session),
        event_bus,
        # Sin canales por defecto -- no todos los tests de este archivo quieren
        # trazabilidad de notificación mezclada con las aserciones de timeline que ya
        # tenían ("case_created", "status_changed"); los tests dedicados a la
        # notificación (más abajo) pasan su propio `NotificationService` con un canal
        # falso.
        notification_service or NotificationService([]),
    )


async def _create_user(
    db_session: AsyncSession, *, role: UserRole, email: str, phone: str | None = None
) -> User:
    user = User(
        email=email,
        hashed_password=hash_password("password123"),
        full_name=email.split("@")[0],
        role=role,
        phone=phone,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


async def _create_remate(db_session: AsyncSession, owner: User) -> Remate:
    remate = Remate(owner_id=owner.id, title="Remate de prueba", category=RemateCategory.HACIENDA)
    db_session.add(remate)
    await db_session.commit()
    await db_session.refresh(remate)
    return remate


async def _create_lote(db_session: AsyncSession, remate: Remate, *, lot_number: str = "1") -> Lote:
    lote = Lote(
        remate_id=remate.id,
        lot_number=lot_number,
        display_order=0,
        title="Lote de prueba",
        category=RemateCategory.HACIENDA,
        base_price=Decimal("1000"),
        min_increment=Decimal("100"),
    )
    db_session.add(lote)
    await db_session.commit()
    await db_session.refresh(lote)
    return lote


async def _build_case(
    db_session: AsyncSession,
    event_bus: _RecordingEventBus,
    notification_service: NotificationService | None = None,
):
    rematador = await _create_user(
        db_session,
        role=UserRole.REMATADOR,
        email=f"r{uuid.uuid4()}@example.com",
        phone="+5491133445566",
    )
    buyer = await _create_user(
        db_session,
        role=UserRole.COMPRADOR,
        email=f"c{uuid.uuid4()}@example.com",
        phone="+5491122334455",
    )
    remate = await _create_remate(db_session, rematador)
    lote = await _create_lote(db_session, remate)
    service = _make_service(db_session, event_bus, notification_service)
    case = await service.create_case_from_winner(
        remate_id=remate.id, lote_id=lote.id, buyer_id=buyer.id, final_price=Decimal("1500")
    )
    return service, case, rematador, buyer


# --- create_case_from_winner -----------------------------------------------------------


async def test_create_case_from_winner_creates_case_in_adjudicado(db_session: AsyncSession) -> None:
    event_bus = _RecordingEventBus()
    _, case, rematador, buyer = await _build_case(db_session, event_bus)

    assert case is not None
    assert case.status == PostAuctionStatus.ADJUDICADO
    assert case.rematador_id == rematador.id
    assert case.buyer_id == buyer.id
    assert case.final_price == Decimal("1500")
    assert any(event.event_type == "postauction.case_created" for event in event_bus.events)


async def test_create_case_from_winner_notifies_buyer_and_rematador(
    db_session: AsyncSession,
) -> None:
    event_bus = _RecordingEventBus()
    _, case, rematador, buyer = await _build_case(db_session, event_bus)

    notification_repository = NotificationRepository(db_session)
    buyer_notifications, buyer_total = await notification_repository.list_for_user(
        buyer.id, unread_only=False, offset=0, limit=10
    )
    rematador_notifications, rematador_total = await notification_repository.list_for_user(
        rematador.id, unread_only=False, offset=0, limit=10
    )

    assert buyer_total == 1
    assert buyer_notifications[0].type == "postauction.case_created"
    assert buyer_notifications[0].resource_id == case.id
    assert rematador_total == 1
    assert rematador_notifications[0].type == "postauction.case_created"


async def test_create_case_from_winner_is_idempotent_per_lote(db_session: AsyncSession) -> None:
    event_bus = _RecordingEventBus()
    service, case, rematador, buyer = await _build_case(db_session, event_bus)

    again = await service.create_case_from_winner(
        remate_id=case.remate_id,
        lote_id=case.lote_id,
        buyer_id=buyer.id,
        final_price=Decimal("9999"),
    )

    assert again is not None
    assert again.id == case.id
    assert again.final_price == Decimal("1500")  # no se pisa con el segundo llamado


# --- notificación de adjudicación (email al ganador) --------------------------------------


async def test_create_case_from_winner_triggers_email_notification(
    db_session: AsyncSession,
) -> None:
    channel = _FakeNotificationChannel()
    event_bus = _RecordingEventBus()
    _, case, rematador, buyer = await _build_case(
        db_session, event_bus, NotificationService([channel])
    )

    assert len(channel.calls) == 1
    context = channel.calls[0]
    assert context.case_id == case.id
    assert context.buyer_email == buyer.email
    assert context.buyer_name == buyer.full_name
    assert context.rematador_name == rematador.full_name
    assert context.remate_title == "Remate de prueba"
    assert context.lote_title == "Lote de prueba"
    assert context.lot_number == "1"
    assert context.final_price == Decimal("1500")
    assert context.currency == "ARS"


async def test_create_case_from_winner_context_includes_phone_and_rematador_id(
    db_session: AsyncSession,
) -> None:
    email_channel = _FakeNotificationChannel(name="email")
    whatsapp_channel = _FakeNotificationChannel(name="whatsapp")
    event_bus = _RecordingEventBus()
    _, case, rematador, buyer = await _build_case(
        db_session, event_bus, NotificationService([email_channel, whatsapp_channel])
    )

    assert len(email_channel.calls) == 1
    assert len(whatsapp_channel.calls) == 1
    for context in (email_channel.calls[0], whatsapp_channel.calls[0]):
        assert context.case_id == case.id
        assert context.buyer_phone == buyer.phone
        assert context.rematador_id == rematador.id
        assert context.rematador_phone == rematador.phone


async def test_create_case_from_winner_records_notification_timeline_entry(
    db_session: AsyncSession,
) -> None:
    channel = _FakeNotificationChannel()
    event_bus = _RecordingEventBus()
    _, case, _, _ = await _build_case(db_session, event_bus, NotificationService([channel]))

    timeline = await PostAuctionRepository(db_session).list_timeline(case.id)
    actions = [entry.action for entry in timeline]
    assert actions == ["case_created", "notification_sent"]
    assert timeline[-1].details == {"channel": "email", "notification_type": "lote_adjudicado"}


async def test_email_failure_does_not_break_adjudication(db_session: AsyncSession) -> None:
    channel = _FakeNotificationChannel(should_fail=True)
    event_bus = _RecordingEventBus()
    _, case, rematador, buyer = await _build_case(
        db_session, event_bus, NotificationService([channel])
    )

    # La venta se creó igual, sin importar que el canal de email haya fallado.
    assert case is not None
    assert case.status == PostAuctionStatus.ADJUDICADO
    assert case.rematador_id == rematador.id
    assert case.buyer_id == buyer.id

    timeline = await PostAuctionRepository(db_session).list_timeline(case.id)
    failed_entry = timeline[-1]
    assert failed_entry.action == "notification_failed"
    assert failed_entry.details["channel"] == "email"
    assert "SMTP no disponible" in failed_entry.details["error"]


async def test_create_case_from_winner_does_not_resend_email_when_redispatched(
    db_session: AsyncSession,
) -> None:
    channel = _FakeNotificationChannel()
    event_bus = _RecordingEventBus()
    service, case, _, buyer = await _build_case(
        db_session, event_bus, NotificationService([channel])
    )

    again = await service.create_case_from_winner(
        remate_id=case.remate_id,
        lote_id=case.lote_id,
        buyer_id=buyer.id,
        final_price=Decimal("9999"),
    )

    assert again is not None
    assert again.id == case.id
    # El segundo llamado es idempotente (mismo `lote_id`) -- nunca vuelve a resolver
    # comprador/remate/lote ni a notificar.
    assert len(channel.calls) == 1


# --- change_status -----------------------------------------------------------------------


async def test_change_status_advances_and_stamps_milestone_date(db_session: AsyncSession) -> None:
    event_bus = _RecordingEventBus()
    service, case, rematador, _ = await _build_case(db_session, event_bus)

    updated = await service.change_status(
        case.id,
        rematador,
        new_status=PostAuctionStatus.PAGO_PENDIENTE,
        note=None,
        occurred_at=None,
    )

    assert updated.status == PostAuctionStatus.PAGO_PENDIENTE
    assert updated.contacted_at is not None
    assert any(event.event_type == "postauction.status_changed" for event in event_bus.events)


async def test_change_status_allows_skipping_ahead(db_session: AsyncSession) -> None:
    event_bus = _RecordingEventBus()
    service, case, rematador, _ = await _build_case(db_session, event_bus)

    updated = await service.change_status(
        case.id,
        rematador,
        new_status=PostAuctionStatus.PAGO_RECIBIDO,
        note=None,
        occurred_at=None,
    )

    assert updated.status == PostAuctionStatus.PAGO_RECIBIDO
    assert updated.payment_at is not None


async def test_change_status_rejects_going_backwards(db_session: AsyncSession) -> None:
    event_bus = _RecordingEventBus()
    service, case, rematador, _ = await _build_case(db_session, event_bus)
    await service.change_status(
        case.id, rematador, new_status=PostAuctionStatus.ENVIADO, note=None, occurred_at=None
    )

    with pytest.raises(BusinessRuleError):
        await service.change_status(
            case.id,
            rematador,
            new_status=PostAuctionStatus.PAGO_PENDIENTE,
            note=None,
            occurred_at=None,
        )


async def test_change_status_forbidden_for_other_rematador(db_session: AsyncSession) -> None:
    event_bus = _RecordingEventBus()
    service, case, _, _ = await _build_case(db_session, event_bus)
    other_rematador = await _create_user(
        db_session, role=UserRole.REMATADOR, email=f"other{uuid.uuid4()}@example.com"
    )

    with pytest.raises(ForbiddenError):
        await service.change_status(
            case.id,
            other_rematador,
            new_status=PostAuctionStatus.PAGO_PENDIENTE,
            note=None,
            occurred_at=None,
        )


async def test_change_status_allowed_for_admin(db_session: AsyncSession) -> None:
    event_bus = _RecordingEventBus()
    service, case, _, _ = await _build_case(db_session, event_bus)
    admin = await _create_user(
        db_session, role=UserRole.ADMIN, email=f"admin{uuid.uuid4()}@example.com"
    )

    updated = await service.change_status(
        case.id, admin, new_status=PostAuctionStatus.PAGO_PENDIENTE, note=None, occurred_at=None
    )
    assert updated.status == PostAuctionStatus.PAGO_PENDIENTE


async def test_change_status_records_timeline_entry(db_session: AsyncSession) -> None:
    event_bus = _RecordingEventBus()
    service, case, rematador, _ = await _build_case(db_session, event_bus)

    await service.change_status(
        case.id,
        rematador,
        new_status=PostAuctionStatus.PENDIENTE_CONTACTO,
        note="Lo llamé por teléfono",
        occurred_at=None,
    )

    timeline = await PostAuctionRepository(db_session).list_timeline(case.id)
    actions = [entry.action for entry in timeline]
    assert actions == ["case_created", "status_changed"]
    status_entry = timeline[-1]
    assert status_entry.previous_status == PostAuctionStatus.ADJUDICADO
    assert status_entry.new_status == PostAuctionStatus.PENDIENTE_CONTACTO
    assert status_entry.note == "Lo llamé por teléfono"
    assert status_entry.actor_id == rematador.id


# --- add_note ------------------------------------------------------------------------------


async def test_add_note_updates_case_and_timeline_without_changing_status(
    db_session: AsyncSession,
) -> None:
    event_bus = _RecordingEventBus()
    service, case, rematador, _ = await _build_case(db_session, event_bus)

    updated = await service.add_note(case.id, rematador, "El comprador pidió envío urgente.")

    assert updated.status == PostAuctionStatus.ADJUDICADO
    assert updated.notes == "El comprador pidió envío urgente."
    timeline = await PostAuctionRepository(db_session).list_timeline(case.id)
    assert timeline[-1].action == "note_added"
    assert timeline[-1].previous_status is None


# --- listados / ownership ------------------------------------------------------------------


async def test_list_for_rematador_filters_by_status_and_search(db_session: AsyncSession) -> None:
    event_bus = _RecordingEventBus()
    service, case, rematador, _ = await _build_case(db_session, event_bus)

    items, total = await service.list_for_rematador(
        rematador,
        status=PostAuctionStatus.ADJUDICADO,
        remate_id=None,
        search=None,
        page=1,
        page_size=20,
    )
    assert total == 1
    assert items[0].id == case.id

    items, total = await service.list_for_rematador(
        rematador,
        status=PostAuctionStatus.ENTREGADO,
        remate_id=None,
        search=None,
        page=1,
        page_size=20,
    )
    assert total == 0


async def test_list_for_buyer_only_returns_own_cases(db_session: AsyncSession) -> None:
    event_bus = _RecordingEventBus()
    service, case, _, buyer = await _build_case(db_session, event_bus)
    other_buyer = await _create_user(
        db_session, role=UserRole.COMPRADOR, email=f"other{uuid.uuid4()}@example.com"
    )

    items, total = await service.list_for_buyer(
        buyer, status=None, search=None, page=1, page_size=20
    )
    assert total == 1
    assert items[0].id == case.id

    items, total = await service.list_for_buyer(
        other_buyer, status=None, search=None, page=1, page_size=20
    )
    assert total == 0


async def test_get_detail_for_buyer_hides_other_buyers_case(db_session: AsyncSession) -> None:
    event_bus = _RecordingEventBus()
    service, case, _, _ = await _build_case(db_session, event_bus)
    other_buyer = await _create_user(
        db_session, role=UserRole.COMPRADOR, email=f"other{uuid.uuid4()}@example.com"
    )

    with pytest.raises(NotFoundError):
        await service.get_detail_for_buyer(case.id, other_buyer)


async def test_get_detail_for_buyer_includes_timeline(db_session: AsyncSession) -> None:
    event_bus = _RecordingEventBus()
    service, case, _, buyer = await _build_case(db_session, event_bus)

    detail = await service.get_detail_for_buyer(case.id, buyer)
    assert detail.id == case.id
    assert len(detail.timeline) == 1
    assert detail.timeline[0].action == "case_created"


# --- privacidad de contacto (email/teléfono) ------------------------------------------------


async def test_list_for_rematador_exposes_buyer_contact(db_session: AsyncSession) -> None:
    event_bus = _RecordingEventBus()
    service, case, rematador, buyer = await _build_case(db_session, event_bus)
    buyer.phone = "+5491111111111"
    await db_session.commit()

    items, _ = await service.list_for_rematador(
        rematador, status=None, remate_id=None, search=None, page=1, page_size=20
    )
    assert items[0].buyer_email == buyer.email
    assert items[0].buyer_phone == "+5491111111111"


async def test_get_detail_for_rematador_exposes_buyer_contact(db_session: AsyncSession) -> None:
    event_bus = _RecordingEventBus()
    service, case, rematador, buyer = await _build_case(db_session, event_bus)
    buyer.phone = "+5491111111111"
    await db_session.commit()

    detail = await service.get_detail_for_rematador(case.id, rematador)
    assert detail.buyer_email == buyer.email
    assert detail.buyer_phone == "+5491111111111"


async def test_get_detail_for_buyer_does_not_expose_contact_fields(db_session: AsyncSession) -> None:
    event_bus = _RecordingEventBus()
    service, case, _, buyer = await _build_case(db_session, event_bus)

    detail = await service.get_detail_for_buyer(case.id, buyer)
    assert not hasattr(detail, "buyer_email")
    assert not hasattr(detail, "buyer_phone")


async def test_get_detail_for_rematador_exposes_lote_base_price(db_session: AsyncSession) -> None:
    event_bus = _RecordingEventBus()
    service, case, rematador, _ = await _build_case(db_session, event_bus)

    detail = await service.get_detail_for_rematador(case.id, rematador)
    assert detail.base_price == Decimal("1000")
