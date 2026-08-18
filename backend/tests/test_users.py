"""Tests de integración del módulo de usuarios: perfil propio (`GET /me`) y foto de
perfil (`POST /me/avatar`, `PATCH /me`) -- pantalla "Mi perfil" del frontend.
"""

from pathlib import Path

from httpx import AsyncClient

from app.core.config import get_settings

REGISTER_URL = "/api/v1/auth/register"
LOGIN_URL = "/api/v1/auth/login"
USERS_URL = "/api/v1/users"


async def _register_and_login(client: AsyncClient, *, email: str, role: str = "comprador") -> str:
    await client.post(
        REGISTER_URL,
        json={
            "email": email,
            "password": "password123",
            "confirm_password": "password123",
            "full_name": "Test",
            "phone": "+5491122334455",
            "role": role,
        },
    )
    login = await client.post(LOGIN_URL, data={"username": email, "password": "password123"})
    assert login.status_code == 200, login.text
    return login.json()["access_token"]


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def test_new_user_has_no_avatar_by_default(client: AsyncClient) -> None:
    token = await _register_and_login(client, email="perfil1@example.com")

    response = await client.get(f"{USERS_URL}/me", headers=_auth(token))

    assert response.status_code == 200
    assert response.json()["avatar_url"] is None


async def test_can_upload_and_persist_an_avatar_photo(client: AsyncClient) -> None:
    token = await _register_and_login(client, email="perfil2@example.com")

    upload = await client.post(
        f"{USERS_URL}/me/avatar",
        files={"file": ("foto.jpg", b"contenido-de-prueba", "image/jpeg")},
        headers=_auth(token),
    )
    assert upload.status_code == 201, upload.text
    url = upload.json()["url"]
    assert "/static/users/avatars/" in url
    assert url.endswith(".jpg")

    relative_path = url.split("/static/", 1)[1]
    saved_file = Path(get_settings().MEDIA_ROOT) / relative_path
    assert saved_file.read_bytes() == b"contenido-de-prueba"

    patch = await client.patch(f"{USERS_URL}/me", json={"avatar_url": url}, headers=_auth(token))
    assert patch.status_code == 200, patch.text
    assert patch.json()["avatar_url"] == url

    me = await client.get(f"{USERS_URL}/me", headers=_auth(token))
    assert me.json()["avatar_url"] == url


async def test_can_set_a_preset_avatar(client: AsyncClient) -> None:
    token = await _register_and_login(client, email="perfil3@example.com")

    response = await client.patch(f"{USERS_URL}/me", json={"avatar_url": "preset:violet"}, headers=_auth(token))

    assert response.status_code == 200
    assert response.json()["avatar_url"] == "preset:violet"


async def test_can_reset_avatar_to_default(client: AsyncClient) -> None:
    token = await _register_and_login(client, email="perfil4@example.com")
    await client.patch(f"{USERS_URL}/me", json={"avatar_url": "preset:violet"}, headers=_auth(token))

    response = await client.patch(f"{USERS_URL}/me", json={"avatar_url": None}, headers=_auth(token))

    assert response.status_code == 200
    assert response.json()["avatar_url"] is None


async def test_avatar_upload_rejects_unsupported_content_type(client: AsyncClient) -> None:
    token = await _register_and_login(client, email="perfil5@example.com")

    response = await client.post(
        f"{USERS_URL}/me/avatar",
        files={"file": ("archivo.txt", b"no es una imagen", "text/plain")},
        headers=_auth(token),
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "business_rule_violation"


async def test_avatar_upload_rejects_oversized_file(client: AsyncClient) -> None:
    token = await _register_and_login(client, email="perfil6@example.com")

    oversized = b"0" * (5 * 1024 * 1024 + 1)
    response = await client.post(
        f"{USERS_URL}/me/avatar",
        files={"file": ("grande.jpg", oversized, "image/jpeg")},
        headers=_auth(token),
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "business_rule_violation"


async def test_avatar_endpoints_require_authentication(client: AsyncClient) -> None:
    upload = await client.post(
        f"{USERS_URL}/me/avatar",
        files={"file": ("foto.jpg", b"contenido", "image/jpeg")},
    )
    patch = await client.patch(f"{USERS_URL}/me", json={"avatar_url": None})

    assert upload.status_code == 401
    assert patch.status_code == 401


async def test_two_users_get_different_avatar_namespaces(client: AsyncClient) -> None:
    token_a = await _register_and_login(client, email="perfil7@example.com")
    token_b = await _register_and_login(client, email="perfil8@example.com")

    response_a = await client.post(
        f"{USERS_URL}/me/avatar",
        files={"file": ("a.jpg", b"contenido-a", "image/jpeg")},
        headers=_auth(token_a),
    )
    response_b = await client.post(
        f"{USERS_URL}/me/avatar",
        files={"file": ("b.jpg", b"contenido-b", "image/jpeg")},
        headers=_auth(token_b),
    )

    url_a_owner_segment = response_a.json()["url"].split("/avatars/")[1].split("/")[0]
    url_b_owner_segment = response_b.json()["url"].split("/avatars/")[1].split("/")[0]
    assert url_a_owner_segment != url_b_owner_segment
