"""Tests del endpoint HTTP del Analytics Service (Épica 7, Módulo 7.1):
`GET /api/v1/remates/{remate_id}/analytics`. Ver docs/35-dashboard-analitica-tiempo-real.md
y ADR-038. Mismo estilo que `test_snapshot_http.py`.
"""

import uuid

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.modules.users.models import User, UserRole

REGISTER_URL = "/api/v1/auth/register"
LOGIN_URL = "/api/v1/auth/login"
REMATES_URL = "/api/v1/remates"


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def _register_and_login(client: AsyncClient, *, email: str, role: str) -> tuple[str, str]:
    register = await client.post(
        REGISTER_URL,
        json={"email": email, "password": "password123", "full_name": "Test", "role": role},
    )
    login = await client.post(LOGIN_URL, data={"username": email, "password": "password123"})
    assert login.status_code == 200, login.text
    return register.json()["id"], login.json()["access_token"]


async def _create_remate(client: AsyncClient, token: str, **overrides) -> dict:
    payload = {
        "title": "Remate de analítica HTTP",
        "category": "hacienda",
        "starts_at": "2027-06-01T10:00:00Z",
    }
    payload.update(overrides)
    r = await client.post(REMATES_URL, json=payload, headers=_auth(token))
    assert r.status_code == 201, r.text
    return r.json()


async def _create_lote(client: AsyncClient, token: str, remate_id: str, **overrides) -> dict:
    payload = {
        "lot_number": overrides.pop("lot_number", "1"),
        "title": "Toro Angus",
        "category": "hacienda",
        "base_price": "1000.00",
        "min_increment": "100.00",
    }
    payload.update(overrides)
    r = await client.post(f"{REMATES_URL}/{remate_id}/lotes", json=payload, headers=_auth(token))
    assert r.status_code == 201, r.text
    return r.json()


async def _start_remate(client: AsyncClient, token: str, remate_id: str) -> None:
    r = await client.post(f"{REMATES_URL}/{remate_id}/schedule", headers=_auth(token))
    assert r.status_code == 200, r.text
    r = await client.post(f"{REMATES_URL}/{remate_id}/start", headers=_auth(token))
    assert r.status_code == 200, r.text


async def test_analytics_endpoint_returns_full_shape_for_owner(client: AsyncClient) -> None:
    _, owner_token = await _register_and_login(
        client, email="anhttp1@example.com", role="rematador"
    )
    remate = await _create_remate(client, owner_token)
    await _create_lote(client, owner_token, remate["id"])
    await _start_remate(client, owner_token, remate["id"])

    r = await client.get(f"{REMATES_URL}/{remate['id']}/analytics", headers=_auth(owner_token))

    assert r.status_code == 200, r.text
    data = r.json()
    assert data["remate_id"] == remate["id"]
    assert set(data.keys()) == {
        "schema_version",
        "remate_id",
        "connected_users_total",
        "connected_buyers",
        "lote_status_counts",
        "average_lote_duration_seconds",
        "total_awarded_value",
        "total_ofertas",
        "ofertas_per_minute",
        "highest_oferta",
        "top_lote_by_offers",
        "bids_timeline",
        "recent_events",
        "generated_at",
    }


async def test_analytics_endpoint_on_remate_without_activity_is_all_zeroes_no_500(
    client: AsyncClient,
) -> None:
    _, owner_token = await _register_and_login(
        client, email="anhttp2@example.com", role="rematador"
    )
    remate = await _create_remate(client, owner_token)  # sin lotes, sin ofertas, en DRAFT

    r = await client.get(f"{REMATES_URL}/{remate['id']}/analytics", headers=_auth(owner_token))

    assert r.status_code == 200, r.text
    data = r.json()
    assert data["total_ofertas"] == 0
    assert data["ofertas_per_minute"] == 0
    assert data["connected_users_total"] == 0
    assert data["connected_buyers"] == 0
    assert data["average_lote_duration_seconds"] is None
    assert data["total_awarded_value"] == "0"
    assert data["highest_oferta"] is None
    assert data["top_lote_by_offers"] is None
    assert data["recent_events"] == []
    assert data["lote_status_counts"] == {
        "pending": 0,
        "open": 0,
        "closed_sold": 0,
        "closed_unsold": 0,
        "cancelled": 0,
        "total": 0,
    }


async def test_analytics_endpoint_succeeds_for_admin(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    _, owner_token = await _register_and_login(
        client, email="anhttp3@example.com", role="rematador"
    )
    remate = await _create_remate(client, owner_token)
    await _create_lote(client, owner_token, remate["id"])
    await _start_remate(client, owner_token, remate["id"])

    # El registro público no permite crear un admin (ADR-010) -- se inserta directo en
    # la base y se loguea con esas credenciales, mismo patrón que el resto de la suite
    # (ver test_snapshot_service.py::test_snapshot_does_not_mask_for_admin_viewer, que
    # en cambio construye el `User` sin pasar por login porque llama al servicio
    # directo; acá sí hace falta un token real porque este test es HTTP end-to-end).
    admin = User(
        email="anhttp3-admin@example.com",
        hashed_password=hash_password("adminpass123"),
        full_name="Admin",
        role=UserRole.ADMIN,
    )
    db_session.add(admin)
    await db_session.commit()

    login = await client.post(
        LOGIN_URL, data={"username": "anhttp3-admin@example.com", "password": "adminpass123"}
    )
    assert login.status_code == 200, login.text
    admin_token = login.json()["access_token"]

    r = await client.get(f"{REMATES_URL}/{remate['id']}/analytics", headers=_auth(admin_token))
    assert r.status_code == 200, r.text


async def test_analytics_endpoint_returns_403_for_unrelated_comprador_on_live_remate(
    client: AsyncClient,
) -> None:
    _, owner_token = await _register_and_login(
        client, email="anhttp4@example.com", role="rematador"
    )
    _, stranger_token = await _register_and_login(
        client, email="anhttp4-stranger@example.com", role="comprador"
    )
    remate = await _create_remate(client, owner_token)
    await _create_lote(client, owner_token, remate["id"])
    await _start_remate(client, owner_token, remate["id"])

    r = await client.get(f"{REMATES_URL}/{remate['id']}/analytics", headers=_auth(stranger_token))

    assert r.status_code == 403, r.text
    assert r.json()["error"]["code"] == "forbidden"


async def test_analytics_endpoint_returns_404_for_draft_remate_seen_by_a_stranger(
    client: AsyncClient,
) -> None:
    _, owner_token = await _register_and_login(
        client, email="anhttp5@example.com", role="rematador"
    )
    _, stranger_token = await _register_and_login(
        client, email="anhttp5-stranger@example.com", role="comprador"
    )
    remate = await _create_remate(client, owner_token)  # queda en DRAFT

    r = await client.get(f"{REMATES_URL}/{remate['id']}/analytics", headers=_auth(stranger_token))

    assert r.status_code == 404, r.text
    assert r.json()["error"]["code"] == "not_found"


async def test_analytics_endpoint_requires_authentication(client: AsyncClient) -> None:
    _, owner_token = await _register_and_login(
        client, email="anhttp6@example.com", role="rematador"
    )
    remate = await _create_remate(client, owner_token)

    r = await client.get(f"{REMATES_URL}/{remate['id']}/analytics")

    assert r.status_code == 401, r.text


async def test_analytics_endpoint_returns_404_for_nonexistent_remate(client: AsyncClient) -> None:
    _, owner_token = await _register_and_login(
        client, email="anhttp7@example.com", role="rematador"
    )

    r = await client.get(
        f"{REMATES_URL}/{uuid.uuid4()}/analytics", headers=_auth(owner_token)
    )

    assert r.status_code == 404, r.text
