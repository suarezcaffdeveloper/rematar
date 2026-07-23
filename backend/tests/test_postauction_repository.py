"""Tests de `PostAuctionRepository` (Épica 7, Módulo 7.5) contra Postgres real."""

import uuid
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.modules.remates.lotes.models import Lote
from app.modules.remates.models import Remate, RemateCategory
from app.modules.users.models import User, UserRole
from app.postauction.models import PostAuctionCase, PostAuctionStatus
from app.postauction.repository import PostAuctionRepository


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


async def _create_lote(
    db_session: AsyncSession, remate: Remate, *, title: str, lot_number: str
) -> Lote:
    lote = Lote(
        remate_id=remate.id,
        lot_number=lot_number,
        display_order=0,
        title=title,
        category=RemateCategory.HACIENDA,
        base_price=Decimal("1000"),
        min_increment=Decimal("100"),
    )
    db_session.add(lote)
    await db_session.commit()
    await db_session.refresh(lote)
    return lote


async def _create_case(
    db_session: AsyncSession,
    *,
    remate: Remate,
    lote: Lote,
    buyer: User,
    status: PostAuctionStatus = PostAuctionStatus.ADJUDICADO,
) -> PostAuctionCase:
    case = PostAuctionCase(
        lote_id=lote.id,
        remate_id=remate.id,
        buyer_id=buyer.id,
        rematador_id=remate.owner_id,
        final_price=Decimal("1500"),
        status=status,
    )
    db_session.add(case)
    await db_session.commit()
    await db_session.refresh(case)
    return case


async def test_get_by_lote_id_returns_none_when_no_case(db_session: AsyncSession) -> None:
    repository = PostAuctionRepository(db_session)
    assert await repository.get_by_lote_id(uuid.uuid4()) is None


async def test_list_for_rematador_filters_by_remate_and_search(db_session: AsyncSession) -> None:
    rematador = await _create_user(db_session, role=UserRole.REMATADOR)
    buyer = await _create_user(db_session, role=UserRole.COMPRADOR)
    remate = await _create_remate(db_session, rematador)
    lote_a = await _create_lote(db_session, remate, title="Toro Angus", lot_number="1")
    lote_b = await _create_lote(db_session, remate, title="Tractor John Deere", lot_number="2")
    await _create_case(db_session, remate=remate, lote=lote_a, buyer=buyer)
    await _create_case(db_session, remate=remate, lote=lote_b, buyer=buyer)

    repository = PostAuctionRepository(db_session)

    items, total = await repository.list_for_rematador(
        rematador_id=rematador.id, status=None, remate_id=None, search="Angus", offset=0, limit=20
    )
    assert total == 1
    assert items[0].lote_id == lote_a.id

    items, total = await repository.list_for_rematador(
        rematador_id=rematador.id, status=None, remate_id=None, search=None, offset=0, limit=20
    )
    assert total == 2


async def test_list_for_rematador_scopes_to_owner(db_session: AsyncSession) -> None:
    rematador_a = await _create_user(db_session, role=UserRole.REMATADOR)
    rematador_b = await _create_user(db_session, role=UserRole.REMATADOR)
    buyer = await _create_user(db_session, role=UserRole.COMPRADOR)
    remate_a = await _create_remate(db_session, rematador_a)
    lote_a = await _create_lote(db_session, remate_a, title="Lote A", lot_number="1")
    await _create_case(db_session, remate=remate_a, lote=lote_a, buyer=buyer)

    repository = PostAuctionRepository(db_session)
    items, total = await repository.list_for_rematador(
        rematador_id=rematador_b.id, status=None, remate_id=None, search=None, offset=0, limit=20
    )
    assert total == 0
    assert items == []


async def test_list_for_buyer_scopes_to_buyer(db_session: AsyncSession) -> None:
    rematador = await _create_user(db_session, role=UserRole.REMATADOR)
    buyer_a = await _create_user(db_session, role=UserRole.COMPRADOR)
    buyer_b = await _create_user(db_session, role=UserRole.COMPRADOR)
    remate = await _create_remate(db_session, rematador)
    lote = await _create_lote(db_session, remate, title="Lote", lot_number="1")
    await _create_case(db_session, remate=remate, lote=lote, buyer=buyer_a)

    repository = PostAuctionRepository(db_session)
    items, total = await repository.list_for_buyer(buyer_id=buyer_a.id, offset=0, limit=20)
    assert total == 1

    items, total = await repository.list_for_buyer(buyer_id=buyer_b.id, offset=0, limit=20)
    assert total == 0
