"""Tests de la asignación de operador (ADR-048): generar/canjear el código de operador,
y la regla nueva de que un rematador solo puede tener un remate activo asignado a la vez
(Fase 1 del panel "mi remate actual" del rematador, ver `RemateService.claim_operator`).

Ninguno de los endpoints de este flujo (`POST /remates/{id}/operator-code`,
`POST /remates/{id}/claim-operator`) tenía cobertura antes de este archivo.
"""

from httpx import AsyncClient

from tests._role_test_helpers import activate_pending_account

REGISTER_URL = "/api/v1/auth/register"
LOGIN_URL = "/api/v1/auth/login"
REMATES_URL = "/api/v1/remates"
USERS_URL = "/api/v1/users"


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


async def _generate_operator_code(client: AsyncClient, owner_token: str, remate_id: str) -> str:
    response = await client.post(
        f"{REMATES_URL}/{remate_id}/operator-code", headers=_auth(owner_token)
    )
    assert response.status_code == 200, response.text
    return response.json()["code"]


async def _claim(client: AsyncClient, rematador_token: str, remate_id: str, code: str):
    return await client.post(
        f"{REMATES_URL}/{remate_id}/claim-operator",
        json={"code": code},
        headers=_auth(rematador_token),
    )


async def test_rematador_can_claim_operator_code(client: AsyncClient) -> None:
    owner_token = await _register_and_login(client, email="op-owner1@example.com", role="empresa")
    rematador_token = await _register_and_login(client, email="op-rem1@example.com", role="rematador")
    remate = await _create_remate(client, owner_token)
    code = await _generate_operator_code(client, owner_token, remate["id"])

    response = await _claim(client, rematador_token, remate["id"], code)

    assert response.status_code == 200, response.text
    assert response.json()["rematador_id"] is not None


async def test_claim_operator_rejects_invalid_code(client: AsyncClient) -> None:
    owner_token = await _register_and_login(client, email="op-owner2@example.com", role="empresa")
    rematador_token = await _register_and_login(client, email="op-rem2@example.com", role="rematador")
    remate = await _create_remate(client, owner_token)
    await _generate_operator_code(client, owner_token, remate["id"])

    response = await _claim(client, rematador_token, remate["id"], "CODIGOINVALIDO")

    assert response.status_code == 403, response.text


async def test_rematador_cannot_claim_a_second_active_remate(client: AsyncClient) -> None:
    owner_token = await _register_and_login(client, email="op-owner3@example.com", role="empresa")
    rematador_token = await _register_and_login(client, email="op-rem3@example.com", role="rematador")

    remate_a = await _create_remate(client, owner_token, title="Remate A")
    code_a = await _generate_operator_code(client, owner_token, remate_a["id"])
    first_claim = await _claim(client, rematador_token, remate_a["id"], code_a)
    assert first_claim.status_code == 200, first_claim.text

    remate_b = await _create_remate(client, owner_token, title="Remate B")
    code_b = await _generate_operator_code(client, owner_token, remate_b["id"])
    second_claim = await _claim(client, rematador_token, remate_b["id"], code_b)

    assert second_claim.status_code == 422, second_claim.text
    assert second_claim.json()["error"]["message"] == (
        "Ya estás operando otro remate. Salí de esa consola antes de unirte a uno nuevo."
    )

    # El primer remate sigue siendo el suyo -- el intento fallido no lo desvinculó.
    unchanged = await client.get(f"{REMATES_URL}/{remate_a['id']}", headers=_auth(rematador_token))
    assert unchanged.json()["rematador_id"] is not None


async def test_rematador_can_reclaim_the_same_remate(client: AsyncClient) -> None:
    owner_token = await _register_and_login(client, email="op-owner4@example.com", role="empresa")
    rematador_token = await _register_and_login(client, email="op-rem4@example.com", role="rematador")
    remate = await _create_remate(client, owner_token)

    code_1 = await _generate_operator_code(client, owner_token, remate["id"])
    assert (await _claim(client, rematador_token, remate["id"], code_1)).status_code == 200

    # La empresa regenera el código para el mismo rematador (ej. lo perdió) -- canjear de
    # nuevo el mismo remate no debe chocar con la regla de "un remate a la vez".
    code_2 = await _generate_operator_code(client, owner_token, remate["id"])
    second_claim = await _claim(client, rematador_token, remate["id"], code_2)

    assert second_claim.status_code == 200, second_claim.text


async def test_rematador_can_claim_a_new_remate_after_the_previous_one_is_cancelled(
    client: AsyncClient,
) -> None:
    owner_token = await _register_and_login(client, email="op-owner5@example.com", role="empresa")
    rematador_token = await _register_and_login(client, email="op-rem5@example.com", role="rematador")

    remate_a = await _create_remate(client, owner_token, title="Remate A")
    code_a = await _generate_operator_code(client, owner_token, remate_a["id"])
    assert (await _claim(client, rematador_token, remate_a["id"], code_a)).status_code == 200

    cancel_response = await client.post(
        f"{REMATES_URL}/{remate_a['id']}/cancel",
        json={"reason": "Prueba"},
        headers=_auth(owner_token),
    )
    assert cancel_response.status_code == 200, cancel_response.text

    remate_b = await _create_remate(client, owner_token, title="Remate B")
    code_b = await _generate_operator_code(client, owner_token, remate_b["id"])
    second_claim = await _claim(client, rematador_token, remate_b["id"], code_b)

    assert second_claim.status_code == 200, second_claim.text


async def test_list_remates_filters_by_rematador_id(client: AsyncClient) -> None:
    owner_token = await _register_and_login(client, email="op-owner6@example.com", role="empresa")
    rematador_token = await _register_and_login(client, email="op-rem6@example.com", role="rematador")
    other_rematador_token = await _register_and_login(
        client, email="op-rem6b@example.com", role="rematador"
    )

    mine = await _create_remate(client, owner_token, title="Mi remate asignado")
    other = await _create_remate(client, owner_token, title="Remate de otro operador")

    code_mine = await _generate_operator_code(client, owner_token, mine["id"])
    await _claim(client, rematador_token, mine["id"], code_mine)
    code_other = await _generate_operator_code(client, owner_token, other["id"])
    await _claim(client, other_rematador_token, other["id"], code_other)

    me = await client.get(f"{USERS_URL}/me", headers=_auth(rematador_token))
    assert me.status_code == 200, me.text
    my_id = me.json()["id"]

    response = await client.get(
        f"{REMATES_URL}?rematador_id={my_id}", headers=_auth(rematador_token)
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["total"] == 1
    assert body["items"][0]["id"] == mine["id"]
