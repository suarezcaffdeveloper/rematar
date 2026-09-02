"""Tests de remates privados: acceso vía URL + código en vez de listado público.

Cubre `POST /remates` con `access_type=private`, `POST /remates/{id}/private-access-code`
(generar/regenerar), `POST /remates/{id}/redeem-private-access` (canjear) y
`GET /remates/private/mine` (autoservicio de "ya canjeados"), además de la exclusión del
listado público general y la garantía anti-enumeración en el detalle. Ninguno de estos
endpoints tenía cobertura antes de este archivo.
"""

from httpx import AsyncClient

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


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def _create_remate(client: AsyncClient, token: str, **overrides) -> dict:
    payload = {"title": "Remate de campo", "category": "hacienda"}
    payload.update(overrides)
    response = await client.post(REMATES_URL, json=payload, headers=_auth(token))
    assert response.status_code == 201, response.text
    return response.json()


async def _redeem(client: AsyncClient, token: str, remate_id: str, code: str):
    return await client.post(
        f"{REMATES_URL}/{remate_id}/redeem-private-access",
        json={"code": code},
        headers=_auth(token),
    )


async def test_create_private_remate_returns_plaintext_code_once(client: AsyncClient) -> None:
    owner_token = await _register_and_login(client, email="priv-owner1@example.com", role="empresa")

    created = await _create_remate(client, owner_token, access_type="private")

    assert created["access_type"] == "private"
    assert created["private_access_code"] is not None
    assert len(created["private_access_code"]) == 10

    detail = await client.get(f"{REMATES_URL}/{created['id']}", headers=_auth(owner_token))
    assert detail.status_code == 200, detail.text
    assert "private_access_code" not in detail.json()


async def test_public_remate_create_omits_code(client: AsyncClient) -> None:
    owner_token = await _register_and_login(client, email="priv-owner2@example.com", role="empresa")

    created = await _create_remate(client, owner_token)

    assert created["access_type"] == "public"
    assert created["private_access_code"] is None


async def test_private_remate_excluded_from_listing_for_non_owner(client: AsyncClient) -> None:
    owner_token = await _register_and_login(client, email="priv-owner3@example.com", role="empresa")
    buyer_token = await _register_and_login(client, email="priv-buyer3@example.com", role="comprador")
    created = await _create_remate(client, owner_token, access_type="private")
    await client.post(f"{REMATES_URL}/{created['id']}/schedule", headers=_auth(owner_token))

    listing = await client.get(REMATES_URL, headers=_auth(buyer_token))

    assert listing.status_code == 200, listing.text
    ids = [item["id"] for item in listing.json()["items"]]
    assert created["id"] not in ids


async def test_private_remate_detail_404_for_stranger_matches_nonexistent_id(
    client: AsyncClient,
) -> None:
    owner_token = await _register_and_login(client, email="priv-owner4@example.com", role="empresa")
    buyer_token = await _register_and_login(client, email="priv-buyer4@example.com", role="comprador")
    created = await _create_remate(client, owner_token, access_type="private")

    stranger_response = await client.get(
        f"{REMATES_URL}/{created['id']}", headers=_auth(buyer_token)
    )
    nonexistent_response = await client.get(
        f"{REMATES_URL}/00000000-0000-0000-0000-000000000000", headers=_auth(buyer_token)
    )

    assert stranger_response.status_code == 404
    assert nonexistent_response.status_code == 404
    assert stranger_response.json() == nonexistent_response.json()


async def test_redeem_with_valid_code_grants_persistent_access(client: AsyncClient) -> None:
    owner_token = await _register_and_login(client, email="priv-owner5@example.com", role="empresa")
    buyer_token = await _register_and_login(client, email="priv-buyer5@example.com", role="comprador")
    created = await _create_remate(client, owner_token, access_type="private")

    redeem_response = await _redeem(
        client, buyer_token, created["id"], created["private_access_code"]
    )
    assert redeem_response.status_code == 200, redeem_response.text

    # Sin volver a canjear: un GET posterior debe seguir funcionando (acceso persistente,
    # no solo válido para la request del canje).
    detail = await client.get(f"{REMATES_URL}/{created['id']}", headers=_auth(buyer_token))
    assert detail.status_code == 200, detail.text


async def test_redeem_with_wrong_code_returns_generic_404(client: AsyncClient) -> None:
    owner_token = await _register_and_login(client, email="priv-owner6@example.com", role="empresa")
    buyer_token = await _register_and_login(client, email="priv-buyer6@example.com", role="comprador")
    created = await _create_remate(client, owner_token, access_type="private")

    response = await _redeem(client, buyer_token, created["id"], "CODIGOINVALIDO")

    assert response.status_code == 404, response.text


async def test_redeem_does_not_leak_via_public_listing(client: AsyncClient) -> None:
    owner_token = await _register_and_login(client, email="priv-owner7@example.com", role="empresa")
    buyer_token = await _register_and_login(client, email="priv-buyer7@example.com", role="comprador")
    created = await _create_remate(client, owner_token, access_type="private")
    await client.post(f"{REMATES_URL}/{created['id']}/schedule", headers=_auth(owner_token))
    assert (
        await _redeem(client, buyer_token, created["id"], created["private_access_code"])
    ).status_code == 200

    listing = await client.get(REMATES_URL, headers=_auth(buyer_token))

    ids = [item["id"] for item in listing.json()["items"]]
    assert created["id"] not in ids


async def test_regenerate_private_code_does_not_revoke_existing_grants(
    client: AsyncClient,
) -> None:
    owner_token = await _register_and_login(client, email="priv-owner8@example.com", role="empresa")
    buyer_token = await _register_and_login(client, email="priv-buyer8@example.com", role="comprador")
    created = await _create_remate(client, owner_token, access_type="private")
    assert (
        await _redeem(client, buyer_token, created["id"], created["private_access_code"])
    ).status_code == 200

    regenerate = await client.post(
        f"{REMATES_URL}/{created['id']}/private-access-code", headers=_auth(owner_token)
    )
    assert regenerate.status_code == 200, regenerate.text
    assert regenerate.json()["code"] != created["private_access_code"]

    still_visible = await client.get(f"{REMATES_URL}/{created['id']}", headers=_auth(buyer_token))
    assert still_visible.status_code == 200, still_visible.text


async def test_only_empresa_owner_can_generate_private_access_code(client: AsyncClient) -> None:
    owner_token = await _register_and_login(client, email="priv-owner9@example.com", role="empresa")
    other_owner_token = await _register_and_login(
        client, email="priv-owner9b@example.com", role="empresa"
    )
    created = await _create_remate(client, owner_token, access_type="private")

    response = await client.post(
        f"{REMATES_URL}/{created['id']}/private-access-code", headers=_auth(other_owner_token)
    )

    assert response.status_code == 404, response.text


async def test_generate_private_access_code_requires_private_remate(client: AsyncClient) -> None:
    owner_token = await _register_and_login(client, email="priv-owner10@example.com", role="empresa")
    created = await _create_remate(client, owner_token)  # public por defecto

    response = await client.post(
        f"{REMATES_URL}/{created['id']}/private-access-code", headers=_auth(owner_token)
    )

    assert response.status_code == 422, response.text


async def test_only_comprador_role_can_redeem(client: AsyncClient) -> None:
    owner_token = await _register_and_login(client, email="priv-owner11@example.com", role="empresa")
    rematador_token = await _register_and_login(
        client, email="priv-rem11@example.com", role="rematador"
    )
    created = await _create_remate(client, owner_token, access_type="private")

    response = await _redeem(
        client, rematador_token, created["id"], created["private_access_code"]
    )

    assert response.status_code == 403, response.text


async def test_get_private_access_code_returns_same_code_without_regenerating(
    client: AsyncClient,
) -> None:
    owner_token = await _register_and_login(client, email="priv-owner13@example.com", role="empresa")
    created = await _create_remate(client, owner_token, access_type="private")

    first = await client.get(
        f"{REMATES_URL}/{created['id']}/private-access-code", headers=_auth(owner_token)
    )
    assert first.status_code == 200, first.text
    assert first.json()["code"] == created["private_access_code"]

    # Pedirlo de nuevo no lo cambia -- a diferencia del POST, el GET nunca regenera.
    second = await client.get(
        f"{REMATES_URL}/{created['id']}/private-access-code", headers=_auth(owner_token)
    )
    assert second.status_code == 200, second.text
    assert second.json()["code"] == created["private_access_code"]


async def test_get_private_access_code_requires_private_remate(client: AsyncClient) -> None:
    owner_token = await _register_and_login(client, email="priv-owner14@example.com", role="empresa")
    created = await _create_remate(client, owner_token)  # público por defecto

    response = await client.get(
        f"{REMATES_URL}/{created['id']}/private-access-code", headers=_auth(owner_token)
    )

    assert response.status_code == 422, response.text


async def test_only_empresa_owner_can_get_private_access_code(client: AsyncClient) -> None:
    owner_token = await _register_and_login(client, email="priv-owner15@example.com", role="empresa")
    other_owner_token = await _register_and_login(
        client, email="priv-owner15b@example.com", role="empresa"
    )
    created = await _create_remate(client, owner_token, access_type="private")

    response = await client.get(
        f"{REMATES_URL}/{created['id']}/private-access-code", headers=_auth(other_owner_token)
    )

    assert response.status_code == 404, response.text


async def test_list_my_private_access_grants_returns_redeemed_remates(client: AsyncClient) -> None:
    owner_token = await _register_and_login(client, email="priv-owner16@example.com", role="empresa")
    buyer_token = await _register_and_login(client, email="priv-buyer16@example.com", role="comprador")
    created = await _create_remate(client, owner_token, access_type="private")
    assert (
        await _redeem(client, buyer_token, created["id"], created["private_access_code"])
    ).status_code == 200

    mine = await client.get(f"{REMATES_URL}/private/mine", headers=_auth(buyer_token))

    assert mine.status_code == 200, mine.text
    ids = [item["id"] for item in mine.json()]
    assert created["id"] in ids


async def test_list_my_private_access_grants_empty_without_redemption(client: AsyncClient) -> None:
    buyer_token = await _register_and_login(client, email="priv-buyer17@example.com", role="comprador")

    mine = await client.get(f"{REMATES_URL}/private/mine", headers=_auth(buyer_token))

    assert mine.status_code == 200, mine.text
    assert mine.json() == []


async def test_list_my_private_access_grants_still_excluded_from_public_listing(
    client: AsyncClient,
) -> None:
    owner_token = await _register_and_login(client, email="priv-owner18@example.com", role="empresa")
    buyer_token = await _register_and_login(client, email="priv-buyer18@example.com", role="comprador")
    created = await _create_remate(client, owner_token, access_type="private")
    await client.post(f"{REMATES_URL}/{created['id']}/schedule", headers=_auth(owner_token))
    assert (
        await _redeem(client, buyer_token, created["id"], created["private_access_code"])
    ).status_code == 200

    mine = await client.get(f"{REMATES_URL}/private/mine", headers=_auth(buyer_token))
    listing = await client.get(REMATES_URL, headers=_auth(buyer_token))

    assert created["id"] in [item["id"] for item in mine.json()]
    assert created["id"] not in [item["id"] for item in listing.json()["items"]]


async def test_redeem_rate_limited_after_max_attempts(client: AsyncClient) -> None:
    owner_token = await _register_and_login(client, email="priv-owner12@example.com", role="empresa")
    buyer_token = await _register_and_login(client, email="priv-buyer12@example.com", role="comprador")
    created = await _create_remate(client, owner_token, access_type="private")

    # Default: PRIVATE_ACCESS_REDEEM_RATE_LIMIT_MAX_ATTEMPTS=10 -- los primeros 10
    # intentos (todos con código incorrecto) cuentan como intentos "normales" (404), el
    # 11vo debe cortar con 429.
    for _ in range(10):
        response = await _redeem(client, buyer_token, created["id"], "CODIGOINVALIDO")
        assert response.status_code == 404, response.text

    limited = await _redeem(client, buyer_token, created["id"], created["private_access_code"])
    assert limited.status_code == 429, limited.text
