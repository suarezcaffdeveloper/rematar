"""Tests de integración del módulo de lotes (Épica 2, Módulo 2.2).

Cubren: permisos de escritura por ownership del remate padre, visibilidad derivada de la
visibilidad del remate (404 vs 403), ocultamiento del precio de reserva a compradores
(ADR-016), validaciones de precio y de atributos, unicidad de `lot_number` por remate
(ADR-015), asignación automática de `display_order`, reordenamiento, y el congelamiento
de estructura una vez que el remate deja de estar en DRAFT/SCHEDULED (RF-05/RF-07) — este
último forzado directamente en la base con `db_session`, porque el Módulo 2.2 no expone
ninguna acción que lleve un remate a LIVE (esa transición depende de que existan lotes,
ver docs/14-modulo-remate.md, y no se implementa hasta el módulo de Ofertas).
"""

import uuid
from decimal import Decimal

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.modules.remates.models import Remate, RemateStatus
from app.modules.users.models import User, UserRole

REGISTER_URL = "/api/v1/auth/register"
LOGIN_URL = "/api/v1/auth/login"
REMATES_URL = "/api/v1/remates"


def _lotes_url(remate_id: str) -> str:
    return f"{REMATES_URL}/{remate_id}/lotes"


async def _register_and_login(client: AsyncClient, *, email: str, role: str) -> str:
    await client.post(
        REGISTER_URL,
        json={"email": email, "password": "password123", "full_name": "Test", "role": role},
    )
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


async def _schedule_remate(client: AsyncClient, token: str, remate_id: str) -> None:
    response = await client.post(f"{REMATES_URL}/{remate_id}/schedule", headers=_auth(token))
    assert response.status_code == 200, response.text


async def _force_remate_status(
    db_session: AsyncSession, remate_id: str, status: RemateStatus
) -> None:
    """Fuerza el estado del remate directamente en la base — sin pasar por la API, porque
    este módulo no expone ninguna transición que lleve un remate a `LIVE`."""
    remate = await db_session.get(Remate, uuid.UUID(remate_id))
    assert remate is not None
    remate.status = status
    await db_session.commit()


async def _create_lote(client: AsyncClient, token: str, remate_id: str, **overrides) -> dict:
    payload = {
        "lot_number": "1",
        "title": "Toro Angus",
        "category": "hacienda",
        "base_price": "1000.00",
        "min_increment": "50.00",
    }
    payload.update(overrides)
    response = await client.post(_lotes_url(remate_id), json=payload, headers=_auth(token))
    assert response.status_code == 201, response.text
    return response.json()


# --- Creación y permisos por ownership ------------------------------------------------


async def test_owner_can_create_lote_in_draft_remate(client: AsyncClient) -> None:
    token = await _register_and_login(client, email="rematador1@example.com", role="rematador")
    remate = await _create_remate(client, token)

    lote = await _create_lote(client, token, remate["id"])

    assert lote["status"] == "pending"
    assert lote["display_order"] == 0
    assert lote["remate_id"] == remate["id"]
    assert lote["quantity"] == 1
    assert lote["images"] == []
    assert lote["documents"] == []
    assert lote["attributes"] == {}


async def test_comprador_cannot_create_lote(client: AsyncClient) -> None:
    owner_token = await _register_and_login(
        client, email="rematador2@example.com", role="rematador"
    )
    remate = await _create_remate(client, owner_token, starts_at="2027-06-01T10:00:00Z")
    await _schedule_remate(client, owner_token, remate["id"])

    comprador_token = await _register_and_login(
        client, email="comprador1@example.com", role="comprador"
    )
    response = await client.post(
        _lotes_url(remate["id"]),
        json={
            "lot_number": "1",
            "title": "Intento ajeno",
            "category": "hacienda",
            "base_price": "1000.00",
            "min_increment": "50.00",
        },
        headers=_auth(comprador_token),
    )
    assert response.status_code == 403


async def test_other_rematador_cannot_create_lote_in_foreign_draft(client: AsyncClient) -> None:
    owner_token = await _register_and_login(
        client, email="rematador3@example.com", role="rematador"
    )
    remate = await _create_remate(client, owner_token)

    other_token = await _register_and_login(
        client, email="rematador4@example.com", role="rematador"
    )
    response = await client.post(
        _lotes_url(remate["id"]),
        json={
            "lot_number": "1",
            "title": "Intento ajeno",
            "category": "hacienda",
            "base_price": "1000.00",
            "min_increment": "50.00",
        },
        headers=_auth(other_token),
    )
    # Borrador ajeno: 404, no 403 (no se confirma que el remate existe).
    assert response.status_code == 404


async def test_display_order_is_assigned_sequentially(client: AsyncClient) -> None:
    token = await _register_and_login(client, email="rematador5@example.com", role="rematador")
    remate = await _create_remate(client, token)

    first = await _create_lote(client, token, remate["id"], lot_number="1")
    second = await _create_lote(client, token, remate["id"], lot_number="2")

    assert first["display_order"] == 0
    assert second["display_order"] == 1


# --- Validaciones ------------------------------------------------------------------


async def test_reserve_price_below_base_price_is_rejected(client: AsyncClient) -> None:
    token = await _register_and_login(client, email="rematador6@example.com", role="rematador")
    remate = await _create_remate(client, token)

    response = await client.post(
        _lotes_url(remate["id"]),
        json={
            "lot_number": "1",
            "title": "Lote inválido",
            "category": "hacienda",
            "base_price": "1000.00",
            "min_increment": "50.00",
            "reserve_price": "500.00",
        },
        headers=_auth(token),
    )
    assert response.status_code == 422


async def test_base_price_must_be_positive(client: AsyncClient) -> None:
    token = await _register_and_login(client, email="rematador7@example.com", role="rematador")
    remate = await _create_remate(client, token)

    response = await client.post(
        _lotes_url(remate["id"]),
        json={
            "lot_number": "1",
            "title": "Lote inválido",
            "category": "hacienda",
            "base_price": "0",
            "min_increment": "50.00",
        },
        headers=_auth(token),
    )
    assert response.status_code == 422


async def test_too_many_attributes_is_rejected(client: AsyncClient) -> None:
    token = await _register_and_login(client, email="rematador8@example.com", role="rematador")
    remate = await _create_remate(client, token)

    response = await client.post(
        _lotes_url(remate["id"]),
        json={
            "lot_number": "1",
            "title": "Lote con demasiados atributos",
            "category": "hacienda",
            "base_price": "1000.00",
            "min_increment": "50.00",
            "attributes": {f"clave_{i}": i for i in range(31)},
        },
        headers=_auth(token),
    )
    assert response.status_code == 422


async def test_duplicate_lot_number_in_same_remate_is_conflict(client: AsyncClient) -> None:
    token = await _register_and_login(client, email="rematador9@example.com", role="rematador")
    remate = await _create_remate(client, token)
    await _create_lote(client, token, remate["id"], lot_number="1")

    response = await client.post(
        _lotes_url(remate["id"]),
        json={
            "lot_number": "1",
            "title": "Otro lote con el mismo número",
            "category": "hacienda",
            "base_price": "1000.00",
            "min_increment": "50.00",
        },
        headers=_auth(token),
    )
    assert response.status_code == 409


async def test_same_lot_number_allowed_across_different_remates(client: AsyncClient) -> None:
    token = await _register_and_login(client, email="rematador10@example.com", role="rematador")
    remate_a = await _create_remate(client, token, title="Remate A")
    remate_b = await _create_remate(client, token, title="Remate B")

    lote_a = await _create_lote(client, token, remate_a["id"], lot_number="1")
    lote_b = await _create_lote(client, token, remate_b["id"], lot_number="1")

    assert lote_a["lot_number"] == lote_b["lot_number"] == "1"


# --- Visibilidad y ocultamiento del precio de reserva (ADR-016) -----------------------


async def test_owner_can_see_lote_of_own_draft(client: AsyncClient) -> None:
    token = await _register_and_login(client, email="rematador11@example.com", role="rematador")
    remate = await _create_remate(client, token)
    lote = await _create_lote(client, token, remate["id"], reserve_price="1200.00")

    response = await client.get(f"{_lotes_url(remate['id'])}/{lote['id']}", headers=_auth(token))
    assert response.status_code == 200
    assert Decimal(str(response.json()["reserve_price"])) == Decimal("1200.00")


async def test_other_rematador_cannot_see_lote_of_foreign_draft(client: AsyncClient) -> None:
    owner_token = await _register_and_login(
        client, email="rematador12@example.com", role="rematador"
    )
    remate = await _create_remate(client, owner_token)
    lote = await _create_lote(client, owner_token, remate["id"])

    other_token = await _register_and_login(
        client, email="rematador13@example.com", role="rematador"
    )
    response = await client.get(
        f"{_lotes_url(remate['id'])}/{lote['id']}", headers=_auth(other_token)
    )
    assert response.status_code == 404


async def test_admin_can_see_lote_of_any_draft(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner_token = await _register_and_login(
        client, email="rematador14@example.com", role="rematador"
    )
    remate = await _create_remate(client, owner_token)
    lote = await _create_lote(client, owner_token, remate["id"], reserve_price="1200.00")

    admin_token = await _create_admin_and_login(client, db_session, "admin1@example.com")
    response = await client.get(
        f"{_lotes_url(remate['id'])}/{lote['id']}", headers=_auth(admin_token)
    )
    assert response.status_code == 200
    assert Decimal(str(response.json()["reserve_price"])) == Decimal("1200.00")


async def test_comprador_sees_lote_of_scheduled_remate_with_reserve_price_hidden(
    client: AsyncClient,
) -> None:
    owner_token = await _register_and_login(
        client, email="rematador15@example.com", role="rematador"
    )
    remate = await _create_remate(client, owner_token, starts_at="2027-06-01T10:00:00Z")
    lote = await _create_lote(client, owner_token, remate["id"], reserve_price="1200.00")
    await _schedule_remate(client, owner_token, remate["id"])

    comprador_token = await _register_and_login(
        client, email="comprador2@example.com", role="comprador"
    )
    response = await client.get(
        f"{_lotes_url(remate['id'])}/{lote['id']}", headers=_auth(comprador_token)
    )
    assert response.status_code == 200
    assert response.json()["reserve_price"] is None


async def test_comprador_cannot_see_lote_of_draft_remate(client: AsyncClient) -> None:
    owner_token = await _register_and_login(
        client, email="rematador16@example.com", role="rematador"
    )
    remate = await _create_remate(client, owner_token)
    lote = await _create_lote(client, owner_token, remate["id"])

    comprador_token = await _register_and_login(
        client, email="comprador3@example.com", role="comprador"
    )
    response = await client.get(
        f"{_lotes_url(remate['id'])}/{lote['id']}", headers=_auth(comprador_token)
    )
    assert response.status_code == 404


async def test_list_lotes_masks_reserve_price_for_comprador(client: AsyncClient) -> None:
    owner_token = await _register_and_login(
        client, email="rematador17@example.com", role="rematador"
    )
    remate = await _create_remate(client, owner_token, starts_at="2027-06-01T10:00:00Z")
    await _create_lote(client, owner_token, remate["id"], reserve_price="1200.00")
    await _schedule_remate(client, owner_token, remate["id"])

    comprador_token = await _register_and_login(
        client, email="comprador4@example.com", role="comprador"
    )
    response = await client.get(_lotes_url(remate["id"]), headers=_auth(comprador_token))
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    assert body["items"][0]["reserve_price"] is None


# --- Edición -----------------------------------------------------------------------


async def test_owner_can_update_lote(client: AsyncClient) -> None:
    token = await _register_and_login(client, email="rematador18@example.com", role="rematador")
    remate = await _create_remate(client, token)
    lote = await _create_lote(client, token, remate["id"])

    response = await client.patch(
        f"{_lotes_url(remate['id'])}/{lote['id']}",
        json={"title": "Título actualizado"},
        headers=_auth(token),
    )
    assert response.status_code == 200
    assert response.json()["title"] == "Título actualizado"


async def test_non_owner_cannot_update_lote(client: AsyncClient) -> None:
    owner_token = await _register_and_login(
        client, email="rematador19@example.com", role="rematador"
    )
    remate = await _create_remate(client, owner_token, starts_at="2027-06-01T10:00:00Z")
    lote = await _create_lote(client, owner_token, remate["id"])
    # Programado (no DRAFT) para que un rematador ajeno reciba 403 (visible, no dueño) en
    # vez de 404 (borrador ajeno, ver docs/15-modulo-lote.md).
    await _schedule_remate(client, owner_token, remate["id"])

    other_token = await _register_and_login(
        client, email="rematador20@example.com", role="rematador"
    )
    response = await client.patch(
        f"{_lotes_url(remate['id'])}/{lote['id']}",
        json={"title": "Intento ajeno"},
        headers=_auth(other_token),
    )
    assert response.status_code == 403


async def test_cannot_update_lote_once_remate_is_live(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    token = await _register_and_login(client, email="rematador21@example.com", role="rematador")
    remate = await _create_remate(client, token)
    lote = await _create_lote(client, token, remate["id"])
    await _force_remate_status(db_session, remate["id"], RemateStatus.LIVE)

    response = await client.patch(
        f"{_lotes_url(remate['id'])}/{lote['id']}",
        json={"title": "No debería aplicarse"},
        headers=_auth(token),
    )
    assert response.status_code == 422


async def test_cannot_create_lote_once_remate_is_live(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    token = await _register_and_login(client, email="rematador22@example.com", role="rematador")
    remate = await _create_remate(client, token)
    await _force_remate_status(db_session, remate["id"], RemateStatus.LIVE)

    response = await client.post(
        _lotes_url(remate["id"]),
        json={
            "lot_number": "1",
            "title": "No debería crearse",
            "category": "hacienda",
            "base_price": "1000.00",
            "min_increment": "50.00",
        },
        headers=_auth(token),
    )
    assert response.status_code == 422


# --- Eliminar (soft delete) ---------------------------------------------------------


async def test_owner_can_delete_lote(client: AsyncClient) -> None:
    token = await _register_and_login(client, email="rematador23@example.com", role="rematador")
    remate = await _create_remate(client, token)
    lote = await _create_lote(client, token, remate["id"])

    delete_response = await client.delete(
        f"{_lotes_url(remate['id'])}/{lote['id']}", headers=_auth(token)
    )
    assert delete_response.status_code == 204

    get_response = await client.get(
        f"{_lotes_url(remate['id'])}/{lote['id']}", headers=_auth(token)
    )
    assert get_response.status_code == 404


async def test_non_owner_cannot_delete_lote(client: AsyncClient) -> None:
    owner_token = await _register_and_login(
        client, email="rematador24@example.com", role="rematador"
    )
    remate = await _create_remate(client, owner_token, starts_at="2027-06-01T10:00:00Z")
    lote = await _create_lote(client, owner_token, remate["id"])
    await _schedule_remate(client, owner_token, remate["id"])

    other_token = await _register_and_login(
        client, email="rematador25@example.com", role="rematador"
    )
    response = await client.delete(
        f"{_lotes_url(remate['id'])}/{lote['id']}", headers=_auth(other_token)
    )
    assert response.status_code == 403


async def test_cannot_delete_lote_once_remate_is_live(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    token = await _register_and_login(client, email="rematador26@example.com", role="rematador")
    remate = await _create_remate(client, token)
    lote = await _create_lote(client, token, remate["id"])
    await _force_remate_status(db_session, remate["id"], RemateStatus.LIVE)

    response = await client.delete(
        f"{_lotes_url(remate['id'])}/{lote['id']}", headers=_auth(token)
    )
    assert response.status_code == 422


# --- Reordenar (RF-07) ---------------------------------------------------------------


async def test_owner_can_reorder_lotes(client: AsyncClient) -> None:
    token = await _register_and_login(client, email="rematador27@example.com", role="rematador")
    remate = await _create_remate(client, token)
    first = await _create_lote(client, token, remate["id"], lot_number="1")
    second = await _create_lote(client, token, remate["id"], lot_number="2")

    response = await client.post(
        f"{_lotes_url(remate['id'])}/reorder",
        json={"lote_ids": [second["id"], first["id"]]},
        headers=_auth(token),
    )
    assert response.status_code == 200
    body = response.json()
    by_id = {item["id"]: item["display_order"] for item in body}
    assert by_id[second["id"]] == 0
    assert by_id[first["id"]] == 1


async def test_reorder_rejects_incomplete_list(client: AsyncClient) -> None:
    token = await _register_and_login(client, email="rematador28@example.com", role="rematador")
    remate = await _create_remate(client, token)
    await _create_lote(client, token, remate["id"], lot_number="1")
    await _create_lote(client, token, remate["id"], lot_number="2")

    only_one = await _create_lote(client, token, remate["id"], lot_number="3")
    response = await client.post(
        f"{_lotes_url(remate['id'])}/reorder",
        json={"lote_ids": [only_one["id"]]},
        headers=_auth(token),
    )
    assert response.status_code == 422


async def test_non_owner_cannot_reorder(client: AsyncClient) -> None:
    owner_token = await _register_and_login(
        client, email="rematador29@example.com", role="rematador"
    )
    remate = await _create_remate(client, owner_token, starts_at="2027-06-01T10:00:00Z")
    lote = await _create_lote(client, owner_token, remate["id"])
    await _schedule_remate(client, owner_token, remate["id"])

    other_token = await _register_and_login(
        client, email="rematador30@example.com", role="rematador"
    )
    response = await client.post(
        f"{_lotes_url(remate['id'])}/reorder",
        json={"lote_ids": [lote["id"]]},
        headers=_auth(other_token),
    )
    assert response.status_code == 403


# --- Atributos flexibles e imágenes (ADR-014) -----------------------------------------


async def test_create_lote_with_attributes_images_and_documents(client: AsyncClient) -> None:
    token = await _register_and_login(client, email="rematador31@example.com", role="rematador")
    remate = await _create_remate(client, token)

    lote = await _create_lote(
        client,
        token,
        remate["id"],
        category="vehiculos",
        attributes={"marca": "Toyota", "anio": 2019, "kilometraje": 85000.5},
        images=[{"url": "https://example.com/foto1.jpg", "order": 0, "caption": "Frente"}],
        documents=[{"url": "https://example.com/titulo.pdf", "title": "Título del vehículo"}],
        quantity=1,
        unit_label="unidad",
    )

    assert lote["attributes"] == {"marca": "Toyota", "anio": 2019, "kilometraje": 85000.5}
    assert lote["images"][0]["caption"] == "Frente"
    assert lote["documents"][0]["title"] == "Título del vehículo"
