"""Tests de la validación de `RemateSettings.guarantee_required`/`guarantee_amount` --
Fase 1 del plan de Garantía Económica (bloqueo de tarjeta vía Mercado Pago). Cubre
únicamente la forma de los settings vía `POST /remates` y `PATCH /remates/{id}` (mismo
nivel que `test_timed_auctions.py` para anti-sniping); el gate de "ofertar sin garantía
activa" y la integración real con Mercado Pago se agregan en fases posteriores.
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


async def _create_remate_raw(client: AsyncClient, token: str, payload: dict):
    return await client.post(REMATES_URL, json=payload, headers=_auth(token))


def _payload(**overrides) -> dict:
    payload = {"title": "Remate con garantía", "category": "hacienda"}
    payload.update(overrides)
    return payload


async def test_guarantee_required_without_amount_is_rejected(client: AsyncClient) -> None:
    owner_token = await _register_and_login(client, email="garantia-c1@example.com", role="empresa")
    payload = _payload(settings={"guarantee_required": True})
    response = await _create_remate_raw(client, owner_token, payload)
    assert response.status_code == 422, response.text


async def test_guarantee_required_with_zero_amount_is_rejected(client: AsyncClient) -> None:
    owner_token = await _register_and_login(client, email="garantia-c2@example.com", role="empresa")
    payload = _payload(settings={"guarantee_required": True, "guarantee_amount": "0"})
    response = await _create_remate_raw(client, owner_token, payload)
    assert response.status_code == 422, response.text


async def test_guarantee_required_with_amount_succeeds(client: AsyncClient) -> None:
    owner_token = await _register_and_login(client, email="garantia-c3@example.com", role="empresa")
    payload = _payload(settings={"guarantee_required": True, "guarantee_amount": "50000.00"})
    response = await _create_remate_raw(client, owner_token, payload)
    assert response.status_code == 201, response.text
    settings = response.json()["settings"]
    assert settings["guarantee_required"] is True
    assert float(settings["guarantee_amount"]) == 50000.00


async def test_guarantee_not_required_by_default(client: AsyncClient) -> None:
    owner_token = await _register_and_login(client, email="garantia-c4@example.com", role="empresa")
    response = await _create_remate_raw(client, owner_token, _payload())
    assert response.status_code == 201, response.text
    settings = response.json()["settings"]
    assert settings["guarantee_required"] is False
    assert settings["guarantee_amount"] is None


async def test_update_settings_to_require_guarantee_without_amount_is_rejected(
    client: AsyncClient,
) -> None:
    owner_token = await _register_and_login(client, email="garantia-c5@example.com", role="empresa")
    created = await _create_remate_raw(client, owner_token, _payload())
    assert created.status_code == 201, created.text
    remate_id = created.json()["id"]

    response = await client.patch(
        f"{REMATES_URL}/{remate_id}",
        json={"settings": {"guarantee_required": True}},
        headers=_auth(owner_token),
    )
    assert response.status_code == 422, response.text
