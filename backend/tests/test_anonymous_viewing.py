"""Tests de visibilidad pública sin autenticación (ADR-049, Fase 3a del plan de roles).

Cubren: un visitante sin sesión puede listar/ver remates y lotes no-DRAFT (mismo trato
que "cualquier usuario que no es dueño ni admin"), sigue sin poder ver un DRAFT ajeno,
sigue sin poder ofertar ni ver el historial completo de ofertas (eso sigue exigiendo
sesión), y un token inválido/expirado sigue devolviendo 401 en vez de degradarse en
silencio a "anónimo".
"""

from httpx import AsyncClient
from tests._role_test_helpers import activate_pending_account

REGISTER_URL = "/api/v1/auth/register"
LOGIN_URL = "/api/v1/auth/login"
REMATES_URL = "/api/v1/remates"


def _lotes_url(remate_id: str) -> str:
    return f"{REMATES_URL}/{remate_id}/lotes"


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


async def test_anonymous_can_see_scheduled_remate(client: AsyncClient) -> None:
    owner_token = await _register_and_login(client, email="anon-owner1@example.com", role="empresa")
    remate = await _create_remate(
        client, owner_token, title="Remate público", starts_at="2027-06-01T10:00:00Z"
    )
    await _schedule_remate(client, owner_token, remate["id"])

    response = await client.get(f"{REMATES_URL}/{remate['id']}")
    assert response.status_code == 200
    assert response.json()["title"] == "Remate público"


async def test_anonymous_cannot_see_draft_remate(client: AsyncClient) -> None:
    owner_token = await _register_and_login(client, email="anon-owner2@example.com", role="empresa")
    remate = await _create_remate(client, owner_token)

    response = await client.get(f"{REMATES_URL}/{remate['id']}")
    assert response.status_code == 404


async def test_anonymous_listing_excludes_draft(client: AsyncClient) -> None:
    owner_token = await _register_and_login(client, email="anon-owner3@example.com", role="empresa")
    await _create_remate(client, owner_token, title="Sigue en borrador")
    scheduled = await _create_remate(
        client, owner_token, title="Ya programado", starts_at="2027-06-01T10:00:00Z"
    )
    await _schedule_remate(client, owner_token, scheduled["id"])

    response = await client.get(REMATES_URL)
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    assert body["items"][0]["title"] == "Ya programado"


async def test_anonymous_can_list_and_see_lotes_of_scheduled_remate_with_reserve_price_hidden(
    client: AsyncClient,
) -> None:
    owner_token = await _register_and_login(client, email="anon-owner4@example.com", role="empresa")
    remate = await _create_remate(
        client, owner_token, title="Con lotes", starts_at="2027-06-01T10:00:00Z"
    )
    lote = await _create_lote(client, owner_token, remate["id"], reserve_price="1200.00")
    await _schedule_remate(client, owner_token, remate["id"])

    list_response = await client.get(_lotes_url(remate["id"]))
    assert list_response.status_code == 200
    body = list_response.json()
    assert body["total"] == 1
    assert body["items"][0]["reserve_price"] is None

    detail_response = await client.get(f"{_lotes_url(remate['id'])}/{lote['id']}")
    assert detail_response.status_code == 200
    assert detail_response.json()["reserve_price"] is None


async def test_anonymous_cannot_see_lote_of_draft_remate(client: AsyncClient) -> None:
    owner_token = await _register_and_login(client, email="anon-owner5@example.com", role="empresa")
    remate = await _create_remate(client, owner_token)
    lote = await _create_lote(client, owner_token, remate["id"])

    response = await client.get(f"{_lotes_url(remate['id'])}/{lote['id']}")
    assert response.status_code == 404


async def test_anonymous_can_see_leading_offer_amount(client: AsyncClient) -> None:
    owner_token = await _register_and_login(client, email="anon-owner6@example.com", role="empresa")
    remate = await _create_remate(
        client, owner_token, title="Con oferta", starts_at="2027-06-01T10:00:00Z"
    )
    lote = await _create_lote(client, owner_token, remate["id"])
    await _schedule_remate(client, owner_token, remate["id"])

    response = await client.get(f"{_lotes_url(remate['id'])}/{lote['id']}/ofertas/leading")
    assert response.status_code == 200
    assert response.json()["amount"] is None


async def test_anonymous_cannot_place_a_bid(client: AsyncClient) -> None:
    owner_token = await _register_and_login(client, email="anon-owner7@example.com", role="empresa")
    remate = await _create_remate(
        client, owner_token, title="Sin ofertas anonimas", starts_at="2027-06-01T10:00:00Z"
    )
    lote = await _create_lote(client, owner_token, remate["id"])
    await _schedule_remate(client, owner_token, remate["id"])

    response = await client.post(
        f"{_lotes_url(remate['id'])}/{lote['id']}/ofertas", json={"amount": "1000.00"}
    )
    assert response.status_code == 401


async def test_anonymous_cannot_see_full_oferta_history(client: AsyncClient) -> None:
    owner_token = await _register_and_login(client, email="anon-owner8@example.com", role="empresa")
    remate = await _create_remate(
        client, owner_token, title="Historial privado", starts_at="2027-06-01T10:00:00Z"
    )
    lote = await _create_lote(client, owner_token, remate["id"])
    await _schedule_remate(client, owner_token, remate["id"])

    response = await client.get(f"{_lotes_url(remate['id'])}/{lote['id']}/ofertas")
    assert response.status_code == 401


async def test_invalid_token_still_returns_401_instead_of_falling_back_to_anonymous(
    client: AsyncClient,
) -> None:
    response = await client.get(
        REMATES_URL, headers={"Authorization": "Bearer this-is-not-a-valid-token"}
    )
    assert response.status_code == 401
