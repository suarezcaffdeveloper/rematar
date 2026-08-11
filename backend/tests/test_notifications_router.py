"""Tests HTTP del Notification Service (Épica 7, Módulo 7.5)."""

import uuid

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.notifications.repository import NotificationRepository

REGISTER_URL = "/api/v1/auth/register"
LOGIN_URL = "/api/v1/auth/login"
NOTIFICATIONS_URL = "/api/v1/notifications"


async def _register_and_login(client: AsyncClient, *, email: str) -> str:
    await client.post(
        REGISTER_URL,
        json={
            "email": email,
            "password": "password123",
            "confirm_password": "password123",
            "full_name": "Test",
            "phone": "+5491122334455",
            "role": "comprador",
        },
    )
    login = await client.post(LOGIN_URL, data={"username": email, "password": "password123"})
    assert login.status_code == 200, login.text
    return login.json()["access_token"]


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def _user_id(client: AsyncClient, token: str) -> uuid.UUID:
    response = await client.get("/api/v1/users/me", headers=_auth(token))
    return uuid.UUID(response.json()["id"])


async def test_list_notifications_only_returns_own(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    token = await _register_and_login(client, email=f"{uuid.uuid4()}@example.com")
    other_token = await _register_and_login(client, email=f"{uuid.uuid4()}@example.com")
    user_id = await _user_id(client, token)
    other_id = await _user_id(client, other_token)

    repository = NotificationRepository(db_session)
    repository.create(user_id=user_id, type="test", title="Título", message="Mensaje")
    repository.create(user_id=other_id, type="test", title="Otro", message="Otro mensaje")
    await repository.commit()

    response = await client.get(NOTIFICATIONS_URL, headers=_auth(token))
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["total"] == 1
    assert body["items"][0]["title"] == "Título"


async def test_mark_read_then_unread_count_drops(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    token = await _register_and_login(client, email=f"{uuid.uuid4()}@example.com")
    user_id = await _user_id(client, token)
    repository = NotificationRepository(db_session)
    notification = repository.create(user_id=user_id, type="test", title="T", message="M")
    await repository.commit()
    await repository.refresh(notification)

    count_before = await client.get(f"{NOTIFICATIONS_URL}/no-leidas/conteo", headers=_auth(token))
    assert count_before.json()["unread_count"] == 1

    mark_response = await client.patch(
        f"{NOTIFICATIONS_URL}/{notification.id}/leer", headers=_auth(token)
    )
    assert mark_response.status_code == 200, mark_response.text
    assert mark_response.json()["read_at"] is not None

    count_after = await client.get(f"{NOTIFICATIONS_URL}/no-leidas/conteo", headers=_auth(token))
    assert count_after.json()["unread_count"] == 0


async def test_cannot_mark_another_users_notification_as_read(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    token = await _register_and_login(client, email=f"{uuid.uuid4()}@example.com")
    other_token = await _register_and_login(client, email=f"{uuid.uuid4()}@example.com")
    other_id = await _user_id(client, other_token)
    repository = NotificationRepository(db_session)
    notification = repository.create(user_id=other_id, type="test", title="T", message="M")
    await repository.commit()
    await repository.refresh(notification)

    response = await client.patch(
        f"{NOTIFICATIONS_URL}/{notification.id}/leer", headers=_auth(token)
    )
    assert response.status_code == 404


async def test_mark_all_read(client: AsyncClient, db_session: AsyncSession) -> None:
    token = await _register_and_login(client, email=f"{uuid.uuid4()}@example.com")
    user_id = await _user_id(client, token)
    repository = NotificationRepository(db_session)
    repository.create(user_id=user_id, type="a", title="A", message="a")
    repository.create(user_id=user_id, type="b", title="B", message="b")
    await repository.commit()

    response = await client.post(f"{NOTIFICATIONS_URL}/leer-todas", headers=_auth(token))
    assert response.status_code == 204

    count = await client.get(f"{NOTIFICATIONS_URL}/no-leidas/conteo", headers=_auth(token))
    assert count.json()["unread_count"] == 0
