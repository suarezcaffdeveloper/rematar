"""Tests de `GarantiaExpiryScheduler` -- Fase 6 del plan de Garantía Económica. Ejercita
`tick()` directamente (sin levantar la tarea de fondo), mismo criterio que
`test_lote_timer.py` para `TimerExpiryScheduler`.
"""

import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.core.config import get_settings
from app.core.security import hash_password
from app.modules.garantias.models import Garantia, GarantiaStatus
from app.modules.garantias.scheduler import GarantiaExpiryScheduler
from app.modules.remates.models import Remate, RemateCategory
from app.modules.users.models import User, UserRole
from app.notifications.models import Notification


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
    remate = Remate(owner_id=owner.id, title="Remate campo", category=RemateCategory.HACIENDA)
    db_session.add(remate)
    await db_session.commit()
    await db_session.refresh(remate)
    return remate


async def _create_garantia(
    db_session: AsyncSession,
    *,
    remate: Remate,
    buyer: User,
    status: GarantiaStatus = GarantiaStatus.ACTIVE,
    expires_at: datetime | None,
    expiry_warning_sent_at: datetime | None = None,
) -> Garantia:
    garantia = Garantia(
        remate_id=remate.id,
        buyer_id=buyer.id,
        status=status,
        amount=Decimal("50000.00"),
        currency="ARS",
        mp_payment_id="mp-sched-1",
        authorized_at=datetime.now(UTC) - timedelta(days=1),
        expires_at=expires_at,
        expiry_warning_sent_at=expiry_warning_sent_at,
    )
    db_session.add(garantia)
    await db_session.commit()
    await db_session.refresh(garantia)
    return garantia


def _make_scheduler(db_engine: AsyncEngine) -> GarantiaExpiryScheduler:
    session_factory = async_sessionmaker(bind=db_engine, expire_on_commit=False)
    return GarantiaExpiryScheduler(session_factory, get_settings())


async def test_expires_overdue_active_garantia(
    db_session: AsyncSession, db_engine: AsyncEngine
) -> None:
    owner = await _create_user(db_session, role=UserRole.EMPRESA)
    buyer = await _create_user(db_session, role=UserRole.COMPRADOR)
    remate = await _create_remate(db_session, owner)
    garantia = await _create_garantia(
        db_session, remate=remate, buyer=buyer, expires_at=datetime.now(UTC) - timedelta(hours=1)
    )

    scheduler = _make_scheduler(db_engine)
    expired, warned = await scheduler.tick()

    await db_session.refresh(garantia)
    assert expired == 1
    assert garantia.status == GarantiaStatus.EXPIRED


async def test_does_not_expire_garantia_not_yet_due(
    db_session: AsyncSession, db_engine: AsyncEngine
) -> None:
    owner = await _create_user(db_session, role=UserRole.EMPRESA)
    buyer = await _create_user(db_session, role=UserRole.COMPRADOR)
    remate = await _create_remate(db_session, owner)
    garantia = await _create_garantia(
        db_session, remate=remate, buyer=buyer, expires_at=datetime.now(UTC) + timedelta(hours=100)
    )

    scheduler = _make_scheduler(db_engine)
    expired, warned = await scheduler.tick()

    await db_session.refresh(garantia)
    assert expired == 0
    assert warned == 0
    assert garantia.status == GarantiaStatus.ACTIVE
    assert garantia.expiry_warning_sent_at is None


async def test_sends_warning_notification_within_window(
    db_session: AsyncSession, db_engine: AsyncEngine
) -> None:
    owner = await _create_user(db_session, role=UserRole.EMPRESA)
    buyer = await _create_user(db_session, role=UserRole.COMPRADOR)
    remate = await _create_remate(db_session, owner)
    # Ventana de aviso por defecto: 24hs (GUARANTEE_EXPIRY_WARNING_HOURS) -- 1h desde
    # ahora cae adentro sin estar todavía vencida.
    garantia = await _create_garantia(
        db_session, remate=remate, buyer=buyer, expires_at=datetime.now(UTC) + timedelta(hours=1)
    )

    scheduler = _make_scheduler(db_engine)
    expired, warned = await scheduler.tick()

    await db_session.refresh(garantia)
    assert expired == 0
    assert warned == 1
    assert garantia.status == GarantiaStatus.ACTIVE
    assert garantia.expiry_warning_sent_at is not None

    notifications = (
        await db_session.execute(select(Notification).where(Notification.user_id == buyer.id))
    ).scalars().all()
    assert len(notifications) == 1
    assert notifications[0].type == "garantia.expiry_warning"
    assert notifications[0].remate_id == remate.id
    assert notifications[0].resource_id == garantia.id


async def test_does_not_resend_warning_twice(
    db_session: AsyncSession, db_engine: AsyncEngine
) -> None:
    owner = await _create_user(db_session, role=UserRole.EMPRESA)
    buyer = await _create_user(db_session, role=UserRole.COMPRADOR)
    remate = await _create_remate(db_session, owner)
    already_warned_at = datetime.now(UTC) - timedelta(minutes=10)
    await _create_garantia(
        db_session,
        remate=remate,
        buyer=buyer,
        expires_at=datetime.now(UTC) + timedelta(hours=1),
        expiry_warning_sent_at=already_warned_at,
    )

    scheduler = _make_scheduler(db_engine)
    expired, warned = await scheduler.tick()

    assert warned == 0
    notifications = (
        await db_session.execute(select(Notification).where(Notification.user_id == buyer.id))
    ).scalars().all()
    assert notifications == []


async def test_ignores_non_active_garantias(
    db_session: AsyncSession, db_engine: AsyncEngine
) -> None:
    owner = await _create_user(db_session, role=UserRole.EMPRESA)
    buyer = await _create_user(db_session, role=UserRole.COMPRADOR)
    remate = await _create_remate(db_session, owner)
    garantia = await _create_garantia(
        db_session,
        remate=remate,
        buyer=buyer,
        status=GarantiaStatus.CAPTURED,
        expires_at=datetime.now(UTC) - timedelta(hours=1),
    )

    scheduler = _make_scheduler(db_engine)
    expired, warned = await scheduler.tick()

    await db_session.refresh(garantia)
    assert expired == 0
    assert warned == 0
    assert garantia.status == GarantiaStatus.CAPTURED
