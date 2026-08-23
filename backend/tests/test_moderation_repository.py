"""Tests de `ModerationRepository` (Épica 7, Módulo 7.6) contra Postgres real."""

import uuid

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.moderation.models import ModerationPinnedMessage, RemateBan
from app.moderation.repository import ModerationRepository
from app.modules.chat.models import ChatMessage, ChatMessageKind
from app.modules.remates.models import Remate, RemateCategory
from app.modules.users.models import User, UserRole


async def _create_user(db_session: AsyncSession, *, role: UserRole = UserRole.COMPRADOR) -> User:
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
    remate = Remate(owner_id=owner.id, title="Remate de prueba", category=RemateCategory.HACIENDA)
    db_session.add(remate)
    await db_session.commit()
    await db_session.refresh(remate)
    return remate


async def _create_message(db_session: AsyncSession, remate: Remate, author: User) -> ChatMessage:
    message = ChatMessage(
        remate_id=remate.id,
        kind=ChatMessageKind.USER,
        author_id=author.id,
        author_name=author.full_name,
        author_role=author.role.value,
        content="Hola a todos",
    )
    db_session.add(message)
    await db_session.commit()
    await db_session.refresh(message)
    return message


# --- Bans ------------------------------------------------------------------------------


async def test_is_banned_false_by_default(db_session: AsyncSession) -> None:
    repository = ModerationRepository(db_session)
    assert await repository.is_banned(uuid.uuid4(), uuid.uuid4()) is False


async def test_add_ban_makes_is_banned_true(db_session: AsyncSession) -> None:
    rematador = await _create_user(db_session, role=UserRole.EMPRESA)
    buyer = await _create_user(db_session)
    remate = await _create_remate(db_session, rematador)
    repository = ModerationRepository(db_session)

    repository.add_ban(RemateBan(remate_id=remate.id, user_id=buyer.id, banned_by_id=rematador.id))
    await repository.commit()

    assert await repository.is_banned(remate.id, buyer.id) is True
    ban = await repository.get_ban(remate.id, buyer.id)
    assert ban is not None
    assert ban.banned_by_id == rematador.id


async def test_ban_is_unique_per_remate_and_user(db_session: AsyncSession) -> None:
    rematador = await _create_user(db_session, role=UserRole.EMPRESA)
    buyer = await _create_user(db_session)
    remate = await _create_remate(db_session, rematador)
    repository = ModerationRepository(db_session)
    repository.add_ban(RemateBan(remate_id=remate.id, user_id=buyer.id, banned_by_id=rematador.id))
    await repository.commit()

    repository.add_ban(RemateBan(remate_id=remate.id, user_id=buyer.id, banned_by_id=rematador.id))
    try:
        await repository.commit()
        raised = False
    except IntegrityError:
        raised = True
        await db_session.rollback()
    assert raised


# --- Mensajes destacados -----------------------------------------------------------------


async def test_pin_and_list_and_unpin_message(db_session: AsyncSession) -> None:
    rematador = await _create_user(db_session, role=UserRole.EMPRESA)
    buyer = await _create_user(db_session)
    remate = await _create_remate(db_session, rematador)
    message = await _create_message(db_session, remate, buyer)
    repository = ModerationRepository(db_session)

    assert await repository.get_pin(message.id) is None

    pin = ModerationPinnedMessage(
        remate_id=remate.id, message_id=message.id, pinned_by_id=rematador.id
    )
    repository.add_pin(pin)
    await repository.commit()

    fetched = await repository.get_pin(message.id)
    assert fetched is not None

    pins = await repository.list_pinned(remate.id)
    assert [p.message_id for p in pins] == [message.id]

    await repository.remove_pin(fetched)
    await repository.commit()
    assert await repository.get_pin(message.id) is None


# --- Usuarios ----------------------------------------------------------------------------


async def test_get_users_by_ids_returns_only_requested_users(db_session: AsyncSession) -> None:
    user_a = await _create_user(db_session)
    user_b = await _create_user(db_session)
    await _create_user(db_session)  # no solicitado, no debe aparecer
    repository = ModerationRepository(db_session)

    result = await repository.get_users_by_ids({user_a.id, user_b.id})

    assert set(result.keys()) == {user_a.id, user_b.id}


async def test_get_users_by_ids_empty_set_returns_empty_dict(db_session: AsyncSession) -> None:
    repository = ModerationRepository(db_session)
    assert await repository.get_users_by_ids(set()) == {}
