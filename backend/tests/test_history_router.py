"""Tests HTTP end-to-end del History Service (Épica 7, Módulo 7.3):
`GET /api/v1/history/remates`, `GET /api/v1/history/remates/{id}` y
`GET /api/v1/history/remates/{id}/lotes/{lote_id}`. Ver
docs/37-historial-y-resultados-de-remates.md y ADR-040. Mismo estilo que
`test_audit_router.py`.
"""

import uuid

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.modules.users.models import User, UserRole

REGISTER_URL = "/api/v1/auth/register"
LOGIN_URL = "/api/v1/auth/login"
REMATES_URL = "/api/v1/remates"
HISTORY_URL = "/api/v1/history/remates"


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def _register_and_login(client: AsyncClient, *, email: str, role: str) -> tuple[str, str]:
    payload = {"email": email, "password": "password123", "full_name": "Test", "role": role}
    register = await client.post(REGISTER_URL, json=payload)
    assert register.status_code == 201, register.text
    login = await client.post(LOGIN_URL, data={"username": email, "password": "password123"})
    assert login.status_code == 200, login.text
    return register.json()["id"], login.json()["access_token"]


async def _owner(client: AsyncClient, email: str) -> tuple[str, str]:
    return await _register_and_login(client, email=email, role="rematador")


async def _buyer(client: AsyncClient, email: str) -> tuple[str, str]:
    return await _register_and_login(client, email=email, role="comprador")


async def _make_admin_and_login(client: AsyncClient, db_session: AsyncSession, email: str) -> str:
    admin = User(
        email=email,
        hashed_password=hash_password("adminpass123"),
        full_name="Admin",
        role=UserRole.ADMIN,
    )
    db_session.add(admin)
    await db_session.commit()
    login = await client.post(LOGIN_URL, data={"username": email, "password": "adminpass123"})
    assert login.status_code == 200, login.text
    return login.json()["access_token"]


async def _create_remate(client: AsyncClient, token: str, **overrides) -> dict:
    payload = {
        "title": "Remate de verificación de historial HTTP",
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


async def _open_lote(client: AsyncClient, token: str, remate_id: str, lote_id: str) -> None:
    r = await client.post(f"{REMATES_URL}/{remate_id}/lotes/{lote_id}/open", headers=_auth(token))
    assert r.status_code == 200, r.text


async def _close_lote(
    client: AsyncClient, token: str, remate_id: str, lote_id: str, *, outcome="unsold", final_price=None
) -> None:
    payload: dict = {"outcome": outcome}
    if final_price is not None:
        payload["final_price"] = final_price
    r = await client.post(
        f"{REMATES_URL}/{remate_id}/lotes/{lote_id}/close", json=payload, headers=_auth(token)
    )
    assert r.status_code == 200, r.text


async def _bid(client: AsyncClient, token: str, remate_id: str, lote_id: str, amount: str) -> dict:
    r = await client.post(
        f"{REMATES_URL}/{remate_id}/lotes/{lote_id}/ofertas",
        json={"amount": amount},
        headers=_auth(token),
    )
    assert r.status_code == 201, r.text
    return r.json()


async def _finish_a_full_remate(
    client: AsyncClient, owner_token: str, buyer_token: str, *, title: str
) -> dict:
    remate = await _create_remate(client, owner_token, title=title)
    lote = await _create_lote(client, owner_token, remate["id"])
    await _start_remate(client, owner_token, remate["id"])
    await _open_lote(client, owner_token, remate["id"], lote["id"])
    await _bid(client, buyer_token, remate["id"], lote["id"], "1000.00")
    await _close_lote(
        client, owner_token, remate["id"], lote["id"], outcome="sold", final_price="1200.00"
    )
    return remate, lote


# --- GET /history/remates ------------------------------------------------------------------


async def test_list_finished_remates_returns_own_remates_for_rematador(
    client: AsyncClient,
) -> None:
    _, owner_token = await _owner(client, "histr1@example.com")
    _, buyer_token = await _buyer(client, "histr1-buyer@example.com")
    remate, _lote = await _finish_a_full_remate(client, owner_token, buyer_token, title="Historial HTTP 1")

    r = await client.get(HISTORY_URL, headers=_auth(owner_token))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["total"] >= 1
    assert any(item["id"] == remate["id"] for item in body["items"])
    matching = next(item for item in body["items"] if item["id"] == remate["id"])
    assert matching["lote_count"] == 1
    assert matching["lotes_sold_count"] == 1
    assert matching["total_awarded_value"] == "1200.00"
    assert matching["buyer_count"] == 1


async def test_list_finished_remates_returns_403_for_comprador(client: AsyncClient) -> None:
    _, buyer_token = await _buyer(client, "histr2@example.com")
    r = await client.get(HISTORY_URL, headers=_auth(buyer_token))
    assert r.status_code == 403, r.text
    assert r.json()["error"]["code"] == "forbidden"


async def test_list_finished_remates_requires_authentication(client: AsyncClient) -> None:
    r = await client.get(HISTORY_URL)
    assert r.status_code == 401, r.text


async def test_list_finished_remates_admin_sees_other_owners_remates(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    _, owner_token = await _owner(client, "histr3@example.com")
    _, buyer_token = await _buyer(client, "histr3-buyer@example.com")
    remate, _lote = await _finish_a_full_remate(client, owner_token, buyer_token, title="Historial HTTP admin")

    admin_token = await _make_admin_and_login(client, db_session, "histr3-admin@example.com")
    r = await client.get(HISTORY_URL, headers=_auth(admin_token))
    assert r.status_code == 200, r.text
    assert any(item["id"] == remate["id"] for item in r.json()["items"])


async def test_list_finished_remates_search_filters_by_title(client: AsyncClient) -> None:
    _, owner_token = await _owner(client, "histr4@example.com")
    _, buyer_token = await _buyer(client, "histr4-buyer@example.com")
    await _finish_a_full_remate(client, owner_token, buyer_token, title="Zebra único")

    r = await client.get(HISTORY_URL, headers=_auth(owner_token), params={"search": "Zebra"})
    assert r.status_code == 200, r.text
    assert r.json()["total"] == 1

    r2 = await client.get(HISTORY_URL, headers=_auth(owner_token), params={"search": "NoExiste"})
    assert r2.json()["total"] == 0


# --- GET /history/remates/{remate_id} -------------------------------------------------------


async def test_get_remate_history_returns_full_shape(client: AsyncClient) -> None:
    _, owner_token = await _owner(client, "histr5@example.com")
    _, buyer_token = await _buyer(client, "histr5-buyer@example.com")
    remate, _lote = await _finish_a_full_remate(client, owner_token, buyer_token, title="Detalle HTTP")

    r = await client.get(f"{HISTORY_URL}/{remate['id']}", headers=_auth(owner_token))
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["remate_id"] == remate["id"]
    assert set(data.keys()) == {
        "remate_id", "title", "category", "status", "starts_at", "finished_at",
        "cancelled_at", "cancellation_reason", "duration_seconds", "lote_status_counts",
        "average_lote_duration_seconds", "total_awarded_value", "total_ofertas",
        "highest_oferta", "top_lote_by_offers", "chat_activity", "participants_count",
        "generated_at",
    }
    assert data["total_ofertas"] == 1
    assert data["lote_status_counts"]["closed_sold"] == 1


async def test_get_remate_history_returns_422_for_live_remate(client: AsyncClient) -> None:
    _, owner_token = await _owner(client, "histr6@example.com")
    remate = await _create_remate(client, owner_token, title="Todavía vivo")
    lote = await _create_lote(client, owner_token, remate["id"])
    await _start_remate(client, owner_token, remate["id"])
    await _open_lote(client, owner_token, remate["id"], lote["id"])

    r = await client.get(f"{HISTORY_URL}/{remate['id']}", headers=_auth(owner_token))
    assert r.status_code == 422, r.text
    assert r.json()["error"]["code"] == "business_rule_violation"


async def test_get_remate_history_returns_403_for_unrelated_rematador(client: AsyncClient) -> None:
    _, owner_token = await _owner(client, "histr7@example.com")
    _, buyer_token = await _buyer(client, "histr7-buyer@example.com")
    remate, _lote = await _finish_a_full_remate(client, owner_token, buyer_token, title="Ajeno HTTP")

    _, stranger_token = await _owner(client, "histr7-stranger@example.com")
    r = await client.get(f"{HISTORY_URL}/{remate['id']}", headers=_auth(stranger_token))
    assert r.status_code == 403, r.text


async def test_get_remate_history_returns_404_for_nonexistent_remate(client: AsyncClient) -> None:
    _, owner_token = await _owner(client, "histr8@example.com")
    r = await client.get(f"{HISTORY_URL}/{uuid.uuid4()}", headers=_auth(owner_token))
    assert r.status_code == 404, r.text


# --- GET /history/remates/{remate_id}/lotes/{lote_id} ---------------------------------------


async def test_get_lote_history_returns_winner_and_offer_history(client: AsyncClient) -> None:
    _, owner_token = await _owner(client, "histr9@example.com")
    buyer_id, buyer_token = await _buyer(client, "histr9-buyer@example.com")
    remate, lote = await _finish_a_full_remate(client, owner_token, buyer_token, title="Lote HTTP")

    r = await client.get(
        f"{HISTORY_URL}/{remate['id']}/lotes/{lote['id']}", headers=_auth(owner_token)
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["winner"]["buyer_id"] == buyer_id
    assert data["offer_count"] == 1
    assert data["offer_history"]["total"] == 1
    assert data["offer_history"]["items"][0]["buyer_id"] == buyer_id
    assert data["time_open_seconds"] is not None


async def test_get_lote_history_returns_403_for_unrelated_rematador(client: AsyncClient) -> None:
    _, owner_token = await _owner(client, "histr10@example.com")
    _, buyer_token = await _buyer(client, "histr10-buyer@example.com")
    remate, lote = await _finish_a_full_remate(client, owner_token, buyer_token, title="Lote ajeno")

    _, stranger_token = await _owner(client, "histr10-stranger@example.com")
    r = await client.get(
        f"{HISTORY_URL}/{remate['id']}/lotes/{lote['id']}", headers=_auth(stranger_token)
    )
    assert r.status_code == 403, r.text
