"""Tests de integración del módulo auth.

Cubren RF-01 (registro/login), la restricción de rol en el registro público (ADR-010) y
el ciclo de vida de refresh tokens con rotación (ADR-011) — el mismo comportamiento que
se verificó manualmente contra el stack real de Docker durante esta fase.
"""

from httpx import AsyncClient

REGISTER_URL = "/api/v1/auth/register"
LOGIN_URL = "/api/v1/auth/login"
REFRESH_URL = "/api/v1/auth/refresh"
LOGOUT_URL = "/api/v1/auth/logout"
ME_URL = "/api/v1/users/me"
USERS_URL = "/api/v1/users"


async def _register_and_login(client: AsyncClient, *, email: str, role: str) -> dict:
    register_response = await client.post(
        REGISTER_URL,
        json={
            "email": email,
            "password": "password123",
            "confirm_password": "password123",
            "full_name": "Test User",
            "phone": "+5491122334455",
            "role": role,
        },
    )
    assert register_response.status_code == 201, register_response.text

    login_response = await client.post(
        LOGIN_URL, data={"username": email, "password": "password123"}
    )
    assert login_response.status_code == 200, login_response.text
    return login_response.json()


async def test_register_rejects_admin_role(client: AsyncClient) -> None:
    response = await client.post(
        REGISTER_URL,
        json={
            "email": "hacker@example.com",
            "password": "password123",
            "confirm_password": "password123",
            "full_name": "H",
            "phone": "+5491122334455",
            "role": "admin",
        },
    )
    assert response.status_code == 422


async def test_register_rejects_duplicate_email(client: AsyncClient) -> None:
    payload = {
        "email": "dup@example.com",
        "password": "password123",
        "confirm_password": "password123",
        "full_name": "A",
        "phone": "+5491122334455",
        "role": "comprador",
    }
    first = await client.post(REGISTER_URL, json=payload)
    assert first.status_code == 201

    second = await client.post(REGISTER_URL, json=payload)
    assert second.status_code == 409


async def test_register_rejects_password_mismatch(client: AsyncClient) -> None:
    response = await client.post(
        REGISTER_URL,
        json={
            "email": "mismatch@example.com",
            "password": "password123",
            "confirm_password": "password456",
            "full_name": "Mismatch User",
            "phone": "+5491122334455",
            "role": "comprador",
        },
    )
    assert response.status_code == 422


async def test_register_rejects_invalid_phone(client: AsyncClient) -> None:
    response = await client.post(
        REGISTER_URL,
        json={
            "email": "badphone@example.com",
            "password": "password123",
            "confirm_password": "password123",
            "full_name": "Bad Phone",
            "phone": "abc123",
            "role": "comprador",
        },
    )
    assert response.status_code == 422


async def test_register_persists_and_normalizes_phone(client: AsyncClient) -> None:
    register_response = await client.post(
        REGISTER_URL,
        json={
            "email": "phoneuser@example.com",
            "password": "password123",
            "confirm_password": "password123",
            "full_name": "Phone User",
            "phone": "+54 9 11 2233-4455",
            "role": "comprador",
        },
    )
    assert register_response.status_code == 201, register_response.text
    assert register_response.json()["phone"] == "+5491122334455"
    assert "confirm_password" not in register_response.json()

    login_response = await client.post(
        LOGIN_URL, data={"username": "phoneuser@example.com", "password": "password123"}
    )
    me_response = await client.get(
        ME_URL,
        headers={"Authorization": f"Bearer {login_response.json()['access_token']}"},
    )
    assert me_response.json()["phone"] == "+5491122334455"


async def test_login_and_read_own_profile(client: AsyncClient) -> None:
    tokens = await _register_and_login(client, email="comprador@example.com", role="comprador")

    me_response = await client.get(
        ME_URL, headers={"Authorization": f"Bearer {tokens['access_token']}"}
    )
    assert me_response.status_code == 200
    body = me_response.json()
    assert body["email"] == "comprador@example.com"
    assert body["role"] == "comprador"
    assert body["phone"] == "+5491122334455"


async def test_login_with_wrong_password_is_unauthorized(client: AsyncClient) -> None:
    await client.post(
        REGISTER_URL,
        json={
            "email": "user2@example.com",
            "password": "password123",
            "confirm_password": "password123",
            "full_name": "U",
            "phone": "+5491122334455",
            "role": "comprador",
        },
    )
    response = await client.post(
        LOGIN_URL, data={"username": "user2@example.com", "password": "wrong-password"}
    )
    assert response.status_code == 401


async def test_comprador_cannot_list_users(client: AsyncClient) -> None:
    tokens = await _register_and_login(client, email="comprador3@example.com", role="comprador")

    response = await client.get(
        USERS_URL, headers={"Authorization": f"Bearer {tokens['access_token']}"}
    )
    assert response.status_code == 403


async def test_refresh_rotates_token_and_rejects_reuse(client: AsyncClient) -> None:
    tokens = await _register_and_login(client, email="rotator@example.com", role="comprador")

    refresh_response = await client.post(
        REFRESH_URL, json={"refresh_token": tokens["refresh_token"]}
    )
    assert refresh_response.status_code == 200
    new_tokens = refresh_response.json()
    assert new_tokens["refresh_token"] != tokens["refresh_token"]

    reuse_response = await client.post(
        REFRESH_URL, json={"refresh_token": tokens["refresh_token"]}
    )
    assert reuse_response.status_code == 401


async def test_logout_revokes_refresh_token(client: AsyncClient) -> None:
    tokens = await _register_and_login(client, email="logout@example.com", role="comprador")

    logout_response = await client.post(
        LOGOUT_URL, json={"refresh_token": tokens["refresh_token"]}
    )
    assert logout_response.status_code == 204

    refresh_response = await client.post(
        REFRESH_URL, json={"refresh_token": tokens["refresh_token"]}
    )
    assert refresh_response.status_code == 401
