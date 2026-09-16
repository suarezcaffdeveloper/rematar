"""Tests del modelo `Garantia`/`GarantiaEvent` contra Postgres real -- Fase 1 del plan de
Garantía Económica (bloqueo de tarjeta vía Mercado Pago). Cubre únicamente forma de datos
(constraints, defaults, cascade); el flujo de negocio (crear/capturar/liberar un hold) se
testea en Fase 2 con `GarantiaService`.
"""

import uuid
from datetime import UTC, datetime
from decimal import Decimal

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.modules.garantias.models import Garantia, GarantiaEvent, GarantiaStatus
from app.modules.remates.models import Remate, RemateCategory
from app.modules.users.models import User, UserRole


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
    status: GarantiaStatus = GarantiaStatus.PENDING_AUTHORIZATION,
) -> Garantia:
    garantia = Garantia(
        remate_id=remate.id,
        buyer_id=buyer.id,
        status=status,
        amount=Decimal("50000.00"),
        currency="ARS",
    )
    db_session.add(garantia)
    await db_session.commit()
    await db_session.refresh(garantia)
    return garantia


async def test_default_status_is_pending_authorization(db_session: AsyncSession) -> None:
    owner = await _create_user(db_session, role=UserRole.EMPRESA)
    buyer = await _create_user(db_session, role=UserRole.COMPRADOR)
    remate = await _create_remate(db_session, owner)

    garantia = await _create_garantia(db_session, remate=remate, buyer=buyer)

    assert garantia.status == GarantiaStatus.PENDING_AUTHORIZATION
    assert garantia.mp_payment_id is None
    assert garantia.captured_amount is None


async def test_unique_constraint_rejects_second_garantia_for_same_remate_and_buyer(
    db_session: AsyncSession,
) -> None:
    owner = await _create_user(db_session, role=UserRole.EMPRESA)
    buyer = await _create_user(db_session, role=UserRole.COMPRADOR)
    remate = await _create_remate(db_session, owner)
    await _create_garantia(db_session, remate=remate, buyer=buyer)

    duplicate = Garantia(
        remate_id=remate.id, buyer_id=buyer.id, amount=Decimal("1000"), currency="ARS"
    )
    db_session.add(duplicate)
    with pytest.raises(IntegrityError):
        await db_session.commit()
    await db_session.rollback()


async def test_same_buyer_can_have_garantias_in_different_remates(
    db_session: AsyncSession,
) -> None:
    owner = await _create_user(db_session, role=UserRole.EMPRESA)
    buyer = await _create_user(db_session, role=UserRole.COMPRADOR)
    remate_a = await _create_remate(db_session, owner)
    remate_b = await _create_remate(db_session, owner)

    await _create_garantia(db_session, remate=remate_a, buyer=buyer)
    await _create_garantia(db_session, remate=remate_b, buyer=buyer)  # no debe fallar


async def test_garantia_event_cascades_on_garantia_delete(db_session: AsyncSession) -> None:
    owner = await _create_user(db_session, role=UserRole.EMPRESA)
    buyer = await _create_user(db_session, role=UserRole.COMPRADOR)
    remate = await _create_remate(db_session, owner)
    garantia = await _create_garantia(db_session, remate=remate, buyer=buyer)

    event = GarantiaEvent(
        garantia_id=garantia.id,
        occurred_at=datetime.now(UTC),
        event_type="created",
        details={"source": "test"},
    )
    db_session.add(event)
    await db_session.commit()

    await db_session.delete(garantia)
    await db_session.commit()

    stmt = select(GarantiaEvent).where(GarantiaEvent.garantia_id == garantia.id)
    remaining = (await db_session.execute(stmt)).scalars().all()
    assert remaining == []


async def test_deleting_remate_with_active_garantia_is_restricted(db_session: AsyncSession) -> None:
    owner = await _create_user(db_session, role=UserRole.EMPRESA)
    buyer = await _create_user(db_session, role=UserRole.COMPRADOR)
    remate = await _create_remate(db_session, owner)
    await _create_garantia(db_session, remate=remate, buyer=buyer)

    await db_session.delete(remate)
    with pytest.raises(IntegrityError):
        await db_session.commit()
    await db_session.rollback()
