"""Tests de integración del módulo de remates (Épica 2, Módulo 2.1).

Cubren: permisos de creación por rol, reglas de visibilidad (borrador ajeno -> 404,
admin ve todo), ownership en escritura (403 para quien no es dueño), y las transiciones
de estado implementadas en esta fase (`schedule`, `cancel`, soft delete) con sus
validaciones — el mismo comportamiento que se verificó manualmente contra el stack real
durante el desarrollo.
"""

from pathlib import Path

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.security import hash_password
from app.modules.users.models import User, UserRole
from tests._role_test_helpers import activate_pending_account

REGISTER_URL = "/api/v1/auth/register"
LOGIN_URL = "/api/v1/auth/login"
REMATES_URL = "/api/v1/remates"


async def _register_and_login(client: AsyncClient, *, email: str, role: str) -> str:
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
    if role in ("empresa", "rematador"):
        await activate_pending_account(email)
    login = await client.post(LOGIN_URL, data={"username": email, "password": "password123"})
    assert login.status_code == 200, login.text
    return login.json()["access_token"]


async def _create_admin_and_login(client: AsyncClient, db_session: AsyncSession, email: str) -> str:
    db_session.add(
        User(
            email=email,
            hashed_password=hash_password("adminpass123"),
            full_name="Admin Test",
            role=UserRole.ADMIN,
        )
    )
    await db_session.commit()
    login = await client.post(LOGIN_URL, data={"username": email, "password": "adminpass123"})
    assert login.status_code == 200, login.text
    return login.json()["access_token"]


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def _create_remate(client: AsyncClient, token: str, **overrides) -> dict:
    payload = {"title": "Remate de campo", "category": "hacienda"}
    payload.update(overrides)
    response = await client.post(REMATES_URL, json=payload, headers=_auth(token))
    assert response.status_code == 201, response.text
    return response.json()


# --- Creación y permisos por rol ---------------------------------------------------


async def test_rematador_can_create_remate_in_draft(client: AsyncClient) -> None:
    token = await _register_and_login(client, email="rematador1@example.com", role="empresa")

    remate = await _create_remate(client, token)

    assert remate["status"] == "draft"
    assert remate["settings"] == {
        "anti_sniping_enabled": False,
        "anti_sniping_extension_seconds": 60,
        "currency": "ARS",
        "lote_timer_seconds": None,
    }
    assert remate["ends_at"] is None
    assert remate["cancelled_at"] is None


async def test_comprador_cannot_create_remate(client: AsyncClient) -> None:
    token = await _register_and_login(client, email="comprador1@example.com", role="comprador")

    response = await client.post(
        REMATES_URL, json={"title": "Remate de campo", "category": "hacienda"}, headers=_auth(token)
    )
    assert response.status_code == 403


async def test_admin_cannot_create_remate(client: AsyncClient, db_session: AsyncSession) -> None:
    token = await _create_admin_and_login(client, db_session, "admin1@example.com")

    response = await client.post(
        REMATES_URL, json={"title": "Remate de campo", "category": "hacienda"}, headers=_auth(token)
    )
    assert response.status_code == 403


async def test_create_rejects_ends_at_before_starts_at(client: AsyncClient) -> None:
    token = await _register_and_login(client, email="rematador2@example.com", role="empresa")

    response = await client.post(
        REMATES_URL,
        json={
            "title": "Remate inválido",
            "category": "hacienda",
            "starts_at": "2027-01-10T10:00:00Z",
            "ends_at": "2027-01-01T10:00:00Z",
        },
        headers=_auth(token),
    )
    assert response.status_code == 422


# --- Visibilidad ---------------------------------------------------------------------


async def test_owner_can_see_own_draft(client: AsyncClient) -> None:
    token = await _register_and_login(client, email="rematador3@example.com", role="empresa")
    remate = await _create_remate(client, token)

    response = await client.get(f"{REMATES_URL}/{remate['id']}", headers=_auth(token))
    assert response.status_code == 200


async def test_other_rematador_cannot_see_foreign_draft(client: AsyncClient) -> None:
    owner_token = await _register_and_login(
        client, email="rematador4@example.com", role="empresa"
    )
    remate = await _create_remate(client, owner_token)

    other_token = await _register_and_login(
        client, email="rematador5@example.com", role="empresa"
    )
    response = await client.get(f"{REMATES_URL}/{remate['id']}", headers=_auth(other_token))
    assert response.status_code == 404


async def test_comprador_cannot_see_foreign_draft(client: AsyncClient) -> None:
    owner_token = await _register_and_login(
        client, email="rematador6@example.com", role="empresa"
    )
    remate = await _create_remate(client, owner_token)

    comprador_token = await _register_and_login(
        client, email="comprador2@example.com", role="comprador"
    )
    response = await client.get(f"{REMATES_URL}/{remate['id']}", headers=_auth(comprador_token))
    assert response.status_code == 404


async def test_admin_can_see_any_draft(client: AsyncClient, db_session: AsyncSession) -> None:
    owner_token = await _register_and_login(
        client, email="rematador7@example.com", role="empresa"
    )
    remate = await _create_remate(client, owner_token)

    admin_token = await _create_admin_and_login(client, db_session, "admin2@example.com")
    response = await client.get(f"{REMATES_URL}/{remate['id']}", headers=_auth(admin_token))
    assert response.status_code == 200


async def test_comprador_sees_scheduled_but_not_draft_in_listing(client: AsyncClient) -> None:
    owner_token = await _register_and_login(
        client, email="rematador8@example.com", role="empresa"
    )
    await _create_remate(client, owner_token, title="Sigue en borrador")
    scheduled = await _create_remate(
        client, owner_token, title="Ya programado", starts_at="2027-06-01T10:00:00Z"
    )
    schedule_response = await client.post(
        f"{REMATES_URL}/{scheduled['id']}/schedule", headers=_auth(owner_token)
    )
    assert schedule_response.status_code == 200

    comprador_token = await _register_and_login(
        client, email="comprador3@example.com", role="comprador"
    )
    response = await client.get(REMATES_URL, headers=_auth(comprador_token))
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    assert body["items"][0]["title"] == "Ya programado"


# --- Edición ---------------------------------------------------------------------------


async def test_owner_can_update_draft(client: AsyncClient) -> None:
    token = await _register_and_login(client, email="rematador9@example.com", role="empresa")
    remate = await _create_remate(client, token)

    response = await client.patch(
        f"{REMATES_URL}/{remate['id']}", json={"title": "Título actualizado"}, headers=_auth(token)
    )
    assert response.status_code == 200
    assert response.json()["title"] == "Título actualizado"


async def test_non_owner_cannot_update(client: AsyncClient) -> None:
    owner_token = await _register_and_login(
        client, email="rematador10@example.com", role="empresa"
    )
    remate = await _create_remate(client, owner_token, starts_at="2027-06-01T10:00:00Z")
    schedule_response = await client.post(
        f"{REMATES_URL}/{remate['id']}/schedule", headers=_auth(owner_token)
    )
    assert schedule_response.status_code == 200

    other_token = await _register_and_login(
        client, email="rematador11@example.com", role="empresa"
    )
    response = await client.patch(
        f"{REMATES_URL}/{remate['id']}", json={"title": "Intento ajeno"}, headers=_auth(other_token)
    )
    assert response.status_code == 403


# --- Programar (schedule) -------------------------------------------------------------


async def test_schedule_requires_starts_at(client: AsyncClient) -> None:
    token = await _register_and_login(client, email="rematador12@example.com", role="empresa")
    remate = await _create_remate(client, token)

    response = await client.post(f"{REMATES_URL}/{remate['id']}/schedule", headers=_auth(token))
    assert response.status_code == 422


async def test_schedule_requires_future_starts_at(client: AsyncClient) -> None:
    token = await _register_and_login(client, email="rematador13@example.com", role="empresa")
    remate = await _create_remate(client, token, starts_at="2020-01-01T10:00:00Z")

    response = await client.post(f"{REMATES_URL}/{remate['id']}/schedule", headers=_auth(token))
    assert response.status_code == 422


async def test_schedule_success_changes_status(client: AsyncClient) -> None:
    token = await _register_and_login(client, email="rematador14@example.com", role="empresa")
    remate = await _create_remate(client, token, starts_at="2027-06-01T10:00:00Z")

    response = await client.post(f"{REMATES_URL}/{remate['id']}/schedule", headers=_auth(token))
    assert response.status_code == 200
    assert response.json()["status"] == "scheduled"


# --- Cancelar --------------------------------------------------------------------------


async def test_cancel_requires_reason(client: AsyncClient) -> None:
    token = await _register_and_login(client, email="rematador15@example.com", role="empresa")
    remate = await _create_remate(client, token)

    response = await client.post(
        f"{REMATES_URL}/{remate['id']}/cancel", json={}, headers=_auth(token)
    )
    assert response.status_code == 422


async def test_cancel_sets_status_and_reason(client: AsyncClient) -> None:
    token = await _register_and_login(client, email="rematador16@example.com", role="empresa")
    remate = await _create_remate(client, token)

    response = await client.post(
        f"{REMATES_URL}/{remate['id']}/cancel",
        json={"reason": "El lote principal se vendió por fuera de la plataforma."},
        headers=_auth(token),
    )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "cancelled"
    assert body["cancellation_reason"] == "El lote principal se vendió por fuera de la plataforma."
    assert body["cancelled_at"] is not None


async def test_cannot_update_after_cancelled(client: AsyncClient) -> None:
    token = await _register_and_login(client, email="rematador17@example.com", role="empresa")
    remate = await _create_remate(client, token)
    await client.post(
        f"{REMATES_URL}/{remate['id']}/cancel",
        json={"reason": "Ya no hace falta."},
        headers=_auth(token),
    )

    response = await client.patch(
        f"{REMATES_URL}/{remate['id']}", json={"title": "Nuevo título"}, headers=_auth(token)
    )
    assert response.status_code == 422


# --- Eliminar (soft delete) -----------------------------------------------------------


async def test_delete_draft_is_soft_delete(client: AsyncClient) -> None:
    token = await _register_and_login(client, email="rematador18@example.com", role="empresa")
    remate = await _create_remate(client, token)

    delete_response = await client.delete(f"{REMATES_URL}/{remate['id']}", headers=_auth(token))
    assert delete_response.status_code == 204

    get_response = await client.get(f"{REMATES_URL}/{remate['id']}", headers=_auth(token))
    assert get_response.status_code == 404


async def test_cannot_delete_scheduled_remate(client: AsyncClient) -> None:
    token = await _register_and_login(client, email="rematador19@example.com", role="empresa")
    remate = await _create_remate(client, token, starts_at="2027-06-01T10:00:00Z")
    await client.post(f"{REMATES_URL}/{remate['id']}/schedule", headers=_auth(token))

    response = await client.delete(f"{REMATES_URL}/{remate['id']}", headers=_auth(token))
    assert response.status_code == 422


async def test_can_delete_cancelled_remate(client: AsyncClient) -> None:
    token = await _register_and_login(client, email="rematador19b@example.com", role="empresa")
    remate = await _create_remate(client, token)
    await client.post(
        f"{REMATES_URL}/{remate['id']}/cancel",
        json={"reason": "Ya no hace falta."},
        headers=_auth(token),
    )

    delete_response = await client.delete(f"{REMATES_URL}/{remate['id']}", headers=_auth(token))
    assert delete_response.status_code == 204

    get_response = await client.get(f"{REMATES_URL}/{remate['id']}", headers=_auth(token))
    assert get_response.status_code == 404


# --- Subida de imagen de portada (refinamiento visual, item 6) ---------------------
# Sin `{remate_id}` en el path: se sube ANTES de crear el remate, desde el mismo modal
# de creación -- ver `RemateService.upload_cover_image`.


async def test_rematador_can_upload_cover_image_before_the_remate_exists(
    client: AsyncClient,
) -> None:
    token = await _register_and_login(client, email="rematador20@example.com", role="empresa")

    response = await client.post(
        f"{REMATES_URL}/cover-image",
        files={"file": ("portada.jpg", b"contenido-de-prueba", "image/jpeg")},
        headers=_auth(token),
    )

    assert response.status_code == 201, response.text
    url = response.json()["url"]
    assert "/static/remates/covers/" in url
    assert url.endswith(".jpg")

    relative_path = url.split("/static/", 1)[1]
    saved_file = Path(get_settings().MEDIA_ROOT) / relative_path
    assert saved_file.read_bytes() == b"contenido-de-prueba"


async def test_uploaded_cover_image_url_can_be_used_to_create_the_remate(
    client: AsyncClient,
) -> None:
    token = await _register_and_login(client, email="rematador21@example.com", role="empresa")

    upload = await client.post(
        f"{REMATES_URL}/cover-image",
        files={"file": ("portada.jpg", b"contenido", "image/jpeg")},
        headers=_auth(token),
    )
    assert upload.status_code == 201, upload.text
    cover_image_url = upload.json()["url"]

    remate = await _create_remate(client, token, cover_image_url=cover_image_url)

    assert remate["cover_image_url"] == cover_image_url


async def test_comprador_cannot_upload_cover_image(client: AsyncClient) -> None:
    token = await _register_and_login(client, email="comprador20@example.com", role="comprador")

    response = await client.post(
        f"{REMATES_URL}/cover-image",
        files={"file": ("portada.jpg", b"contenido", "image/jpeg")},
        headers=_auth(token),
    )

    assert response.status_code == 403


async def test_cover_image_upload_rejects_unsupported_content_type(client: AsyncClient) -> None:
    token = await _register_and_login(client, email="rematador22@example.com", role="empresa")

    response = await client.post(
        f"{REMATES_URL}/cover-image",
        files={"file": ("archivo.txt", b"no es una imagen", "text/plain")},
        headers=_auth(token),
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "business_rule_violation"


async def test_cover_image_upload_rejects_oversized_file(client: AsyncClient) -> None:
    token = await _register_and_login(client, email="rematador23@example.com", role="empresa")

    oversized = b"0" * (5 * 1024 * 1024 + 1)
    response = await client.post(
        f"{REMATES_URL}/cover-image",
        files={"file": ("grande.jpg", oversized, "image/jpeg")},
        headers=_auth(token),
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "business_rule_violation"


async def test_two_rematadores_get_different_cover_image_namespaces(client: AsyncClient) -> None:
    token_a = await _register_and_login(client, email="rematador24@example.com", role="empresa")
    token_b = await _register_and_login(client, email="rematador25@example.com", role="empresa")

    response_a = await client.post(
        f"{REMATES_URL}/cover-image",
        files={"file": ("a.jpg", b"contenido-a", "image/jpeg")},
        headers=_auth(token_a),
    )
    response_b = await client.post(
        f"{REMATES_URL}/cover-image",
        files={"file": ("b.jpg", b"contenido-b", "image/jpeg")},
        headers=_auth(token_b),
    )

    assert response_a.json()["url"] != response_b.json()["url"]
    url_a_owner_segment = response_a.json()["url"].split("/covers/")[1].split("/")[0]
    url_b_owner_segment = response_b.json()["url"].split("/covers/")[1].split("/")[0]
    assert url_a_owner_segment != url_b_owner_segment
