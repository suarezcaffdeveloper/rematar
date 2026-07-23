"""Tests de `NotificationRepository` (Épica 7, Módulo 7.5) contra Postgres real."""

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.modules.users.models import User, UserRole
from app.notifications.repository import NotificationRepository


async def _create_user(db_session: AsyncSession) -> User:
    user = User(
        email=f"{uuid.uuid4()}@example.com",
        hashed_password=hash_password("password123"),
        full_name="Usuario de prueba",
        role=UserRole.COMPRADOR,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


async def test_create_is_unread_by_default(db_session: AsyncSession) -> None:
    user = await _create_user(db_session)
    repository = NotificationRepository(db_session)

    repository.create(user_id=user.id, type="test.created", title="Título", message="Mensaje")
    await repository.commit()

    items, total = await repository.list_for_user(user.id, unread_only=False, offset=0, limit=10)
    assert total == 1
    assert items[0].read_at is None


async def test_list_for_user_unread_only_filters_read(db_session: AsyncSession) -> None:
    user = await _create_user(db_session)
    repository = NotificationRepository(db_session)
    repository.create(user_id=user.id, type="a", title="A", message="a")
    notification_b = repository.create(user_id=user.id, type="b", title="B", message="b")
    await repository.commit()
    await repository.refresh(notification_b)

    await repository.mark_read(notification_b.id, user.id)
    await repository.commit()

    items, total = await repository.list_for_user(user.id, unread_only=True, offset=0, limit=10)
    assert total == 1
    assert items[0].type == "a"


async def test_mark_read_ignores_other_users_notification(db_session: AsyncSession) -> None:
    owner = await _create_user(db_session)
    stranger = await _create_user(db_session)
    repository = NotificationRepository(db_session)
    notification = repository.create(user_id=owner.id, type="a", title="A", message="a")
    await repository.commit()
    await repository.refresh(notification)

    result = await repository.mark_read(notification.id, stranger.id)

    assert result is None
    assert await repository.count_unread(owner.id) == 1


async def test_mark_all_read(db_session: AsyncSession) -> None:
    user = await _create_user(db_session)
    repository = NotificationRepository(db_session)
    repository.create(user_id=user.id, type="a", title="A", message="a")
    repository.create(user_id=user.id, type="b", title="B", message="b")
    await repository.commit()

    await repository.mark_all_read(user.id)
    await repository.commit()

    assert await repository.count_unread(user.id) == 0
