"""Tests del endpoint HTTP del Snapshot Service (Épica 3, Módulo 3.6):
`GET /api/v1/remates/{remate_id}/snapshot`. Existen para demostrar -- no solo declarar
-- que `SnapshotService` es reutilizable por un transporte distinto del Gateway
WebSocket, con la misma semántica de visibilidad/enmascarado. Ver
docs/23-snapshot-service.md y ADR-026.
"""

from httpx import AsyncClient
from tests._role_test_helpers import activate_pending_account

REGISTER_URL = "/api/v1/auth/register"
LOGIN_URL = "/api/v1/auth/login"
REMATES_URL = "/api/v1/remates"


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


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


async def _create_remate(client: AsyncClient, token: str, **overrides) -> dict:
    payload = {
        "title": "Remate de snapshot HTTP",
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
        "reserve_price": "5000.00",
    }
    payload.update(overrides)
    r = await client.post(f"{REMATES_URL}/{remate_id}/lotes", json=payload, headers=_auth(token))
    assert r.status_code == 201, r.text
    return r.json()


async def _start_and_open(client: AsyncClient, token: str, remate_id: str, lote_id: str) -> None:
    r = await client.post(f"{REMATES_URL}/{remate_id}/schedule", headers=_auth(token))
    assert r.status_code == 200, r.text
    r = await client.post(f"{REMATES_URL}/{remate_id}/start", headers=_auth(token))
    assert r.status_code == 200, r.text
    r = await client.post(f"{REMATES_URL}/{remate_id}/lotes/{lote_id}/open", headers=_auth(token))
    assert r.status_code == 200, r.text


async def test_snapshot_endpoint_returns_full_state_for_owner(client: AsyncClient) -> None:
    owner_token = await _register_and_login(client, email="snaphttp1@example.com", role="empresa")
    remate = await _create_remate(client, owner_token)
    lote = await _create_lote(client, owner_token, remate["id"])
    await _start_and_open(client, owner_token, remate["id"], lote["id"])

    r = await client.get(f"{REMATES_URL}/{remate['id']}/snapshot", headers=_auth(owner_token))

    assert r.status_code == 200, r.text
    data = r.json()
    assert data["remate"]["id"] == remate["id"]
    assert data["active_lote"]["id"] == lote["id"]
    assert data["active_lote"]["reserve_price"] == "5000.00"
    assert data["winning_offer"] is None
    assert data["recent_offers"] == []
    assert data["connected_users"] == 0


async def test_snapshot_endpoint_masks_reserve_price_for_non_owner(client: AsyncClient) -> None:
    owner_token = await _register_and_login(client, email="snaphttp2@example.com", role="empresa")
    buyer_token = await _register_and_login(
        client, email="snaphttp2-buyer@example.com", role="comprador"
    )
    remate = await _create_remate(client, owner_token)
    lote = await _create_lote(client, owner_token, remate["id"])
    await _start_and_open(client, owner_token, remate["id"], lote["id"])

    r = await client.get(f"{REMATES_URL}/{remate['id']}/snapshot", headers=_auth(buyer_token))

    assert r.status_code == 200, r.text
    assert r.json()["active_lote"]["reserve_price"] is None


async def test_snapshot_endpoint_returns_404_for_draft_remate_seen_by_a_stranger(
    client: AsyncClient,
) -> None:
    owner_token = await _register_and_login(client, email="snaphttp3@example.com", role="empresa")
    stranger_token = await _register_and_login(
        client, email="snaphttp3-stranger@example.com", role="comprador"
    )
    remate = await _create_remate(client, owner_token)  # queda en DRAFT

    r = await client.get(f"{REMATES_URL}/{remate['id']}/snapshot", headers=_auth(stranger_token))

    assert r.status_code == 404, r.text
    assert r.json()["error"]["code"] == "not_found"


async def test_snapshot_endpoint_anonymous_gets_404_for_draft_remate(client: AsyncClient) -> None:
    """ADR-049: un visitante sin sesión es tratado igual que cualquier otro que no es
    dueño ni admin -- un remate en DRAFT le da 404, no 401 (mismo criterio
    anti-enumeración de `test_snapshot_endpoint_returns_404_for_draft_remate_seen_by_a_stranger`)."""
    owner_token = await _register_and_login(client, email="snaphttp4@example.com", role="empresa")
    remate = await _create_remate(client, owner_token)  # queda en DRAFT

    r = await client.get(f"{REMATES_URL}/{remate['id']}/snapshot")

    assert r.status_code == 404, r.text


async def test_snapshot_endpoint_anonymous_sees_non_draft_remate_with_reserve_price_masked(
    client: AsyncClient,
) -> None:
    """ADR-049: un remate visible (no DRAFT) sí se puede consultar sin sesión -- con el
    mismo enmascarado de `reserve_price` que ya aplica a cualquier viewer no privilegiado."""
    owner_token = await _register_and_login(client, email="snaphttp4b@example.com", role="empresa")
    remate = await _create_remate(client, owner_token)
    lote = await _create_lote(client, owner_token, remate["id"])
    await _start_and_open(client, owner_token, remate["id"], lote["id"])

    r = await client.get(f"{REMATES_URL}/{remate['id']}/snapshot")

    assert r.status_code == 200, r.text
    data = r.json()
    assert data["active_lote"]["reserve_price"] is None
    assert data["connected_users_detail"] is None


async def test_snapshot_endpoint_invalid_token_still_returns_401(client: AsyncClient) -> None:
    owner_token = await _register_and_login(client, email="snaphttp4c@example.com", role="empresa")
    remate = await _create_remate(client, owner_token)

    r = await client.get(
        f"{REMATES_URL}/{remate['id']}/snapshot",
        headers={"Authorization": "Bearer this-is-not-a-valid-token"},
    )

    assert r.status_code == 401, r.text


async def test_snapshot_endpoint_same_shape_as_ws_snapshot_message(client: AsyncClient) -> None:
    """Verifica literalmente el pedido de reutilización: el mismo `SnapshotService`,
    con el mismo `RemateStateSnapshot`, sin importar el transporte -- acá se confirma
    que la respuesta HTTP trae exactamente las mismas claves de nivel superior que
    `SnapshotMessage.data` sobre WebSocket (ver test_websocket_gateway.py)."""
    owner_token = await _register_and_login(client, email="snaphttp5@example.com", role="empresa")
    remate = await _create_remate(client, owner_token)

    r = await client.get(f"{REMATES_URL}/{remate['id']}/snapshot", headers=_auth(owner_token))

    assert r.status_code == 200, r.text
    assert set(r.json().keys()) == {
        "schema_version",
        "remate",
        "active_lote",
        "winning_offer",
        "recent_offers",
        "connected_users",
        "connected_users_detail",
        "generated_at",
    }
