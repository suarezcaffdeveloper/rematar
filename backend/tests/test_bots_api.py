"""Tests de integración HTTP del módulo de bots simuladores de compradores: CRUD de
perfiles, selección de bots por remate y control (Iniciar/Pausar/Detener) de la
simulación. La reacción real de un bot (ofertar/chatear a través del motor real) se
prueba por separado en `test_bots_end_to_end_bidding.py`, porque necesita esperar a que
las tareas `asyncio` en segundo plano reaccionen.
"""

from httpx import AsyncClient

REGISTER_URL = "/api/v1/auth/register"
LOGIN_URL = "/api/v1/auth/login"
REMATES_URL = "/api/v1/remates"
BOTS_URL = "/api/v1/bots"


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def _register_and_login(client: AsyncClient, *, email: str, role: str) -> tuple[str, str]:
    payload = {
        "email": email,
        "password": "password123",
        "confirm_password": "password123",
        "full_name": "Test",
        "phone": "+5491122334455",
        "role": role,
    }
    register = await client.post(REGISTER_URL, json=payload)
    assert register.status_code == 201, register.text
    login = await client.post(LOGIN_URL, data={"username": email, "password": "password123"})
    assert login.status_code == 200, login.text
    return register.json()["id"], login.json()["access_token"]


async def _rematador(client: AsyncClient, email: str) -> tuple[str, str]:
    return await _register_and_login(client, email=email, role="rematador")


async def _comprador(client: AsyncClient, email: str) -> tuple[str, str]:
    return await _register_and_login(client, email=email, role="comprador")


def _bot_payload(**overrides) -> dict:
    payload = {
        "display_name": "Bot Competitivo",
        "personality": "competitive",
        "max_budget": "5000.00",
        "reaction_delay_min_seconds": 1,
        "reaction_delay_max_seconds": 3,
        "continue_probability": "0.80",
        "participates_in_chat": True,
        "chat_message_frequency": "0.50",
    }
    payload.update(overrides)
    return payload


async def _create_bot(client: AsyncClient, token: str, **overrides) -> dict:
    r = await client.post(BOTS_URL, json=_bot_payload(**overrides), headers=_auth(token))
    assert r.status_code == 201, r.text
    return r.json()


async def _create_remate(client: AsyncClient, token: str, **overrides) -> dict:
    payload = {
        "title": "Remate para bots",
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


async def _start_remate_with_open_lote(
    client: AsyncClient, token: str, remate_id: str, lote_id: str
) -> None:
    r = await client.post(f"{REMATES_URL}/{remate_id}/schedule", headers=_auth(token))
    assert r.status_code == 200, r.text
    r = await client.post(f"{REMATES_URL}/{remate_id}/start", headers=_auth(token))
    assert r.status_code == 200, r.text
    r = await client.post(
        f"{REMATES_URL}/{remate_id}/lotes/{lote_id}/open", headers=_auth(token)
    )
    assert r.status_code == 200, r.text


# --- CRUD de perfiles ------------------------------------------------------------------


async def test_create_bot_requires_rematador_role(client: AsyncClient) -> None:
    _, buyer_token = await _comprador(client, "botapi-buyer1@example.com")
    r = await client.post(BOTS_URL, json=_bot_payload(), headers=_auth(buyer_token))
    assert r.status_code == 403, r.text


async def test_create_bot_returns_profile_with_distinct_backing_user(client: AsyncClient) -> None:
    owner_id, owner_token = await _rematador(client, "botapi-owner1@example.com")
    bot = await _create_bot(client, owner_token)

    assert bot["display_name"] == "Bot Competitivo"
    assert bot["personality"] == "competitive"
    assert bot["is_active"] is True
    assert bot["user_id"] != owner_id  # backing user propio, distinto del rematador


async def test_create_bot_rejects_invalid_reaction_window(client: AsyncClient) -> None:
    _, owner_token = await _rematador(client, "botapi-owner2@example.com")
    r = await client.post(
        BOTS_URL,
        json=_bot_payload(reaction_delay_min_seconds=5, reaction_delay_max_seconds=2),
        headers=_auth(owner_token),
    )
    assert r.status_code == 422, r.text


async def test_list_bots_returns_only_own_bots(client: AsyncClient) -> None:
    _, owner_a_token = await _rematador(client, "botapi-owner3a@example.com")
    _, owner_b_token = await _rematador(client, "botapi-owner3b@example.com")
    bot_a = await _create_bot(client, owner_a_token, display_name="Bot de A")
    await _create_bot(client, owner_b_token, display_name="Bot de B")

    r = await client.get(BOTS_URL, headers=_auth(owner_a_token))
    assert r.status_code == 200, r.text
    ids = [b["id"] for b in r.json()]
    assert bot_a["id"] in ids
    assert len(ids) == 1


async def test_get_bot_from_another_owner_returns_not_found(client: AsyncClient) -> None:
    _, owner_a_token = await _rematador(client, "botapi-owner4a@example.com")
    _, owner_b_token = await _rematador(client, "botapi-owner4b@example.com")
    bot = await _create_bot(client, owner_a_token)

    r = await client.get(f"{BOTS_URL}/{bot['id']}", headers=_auth(owner_b_token))
    assert r.status_code == 404, r.text


async def test_update_bot_changes_configuration(client: AsyncClient) -> None:
    _, owner_token = await _rematador(client, "botapi-owner5@example.com")
    bot = await _create_bot(client, owner_token)

    r = await client.patch(
        f"{BOTS_URL}/{bot['id']}",
        json={"max_budget": "9999.00", "is_active": False},
        headers=_auth(owner_token),
    )
    assert r.status_code == 200, r.text
    updated = r.json()
    assert updated["max_budget"] == "9999.00"
    assert updated["is_active"] is False


async def test_delete_bot_soft_deletes_it(client: AsyncClient) -> None:
    _, owner_token = await _rematador(client, "botapi-owner6@example.com")
    bot = await _create_bot(client, owner_token)

    r = await client.delete(f"{BOTS_URL}/{bot['id']}", headers=_auth(owner_token))
    assert r.status_code == 204, r.text

    r = await client.get(f"{BOTS_URL}/{bot['id']}", headers=_auth(owner_token))
    assert r.status_code == 404, r.text


# --- Selección de bots por remate --------------------------------------------------------


async def test_set_selection_requires_owned_bot(client: AsyncClient) -> None:
    _, owner_a_token = await _rematador(client, "botapi-sel1a@example.com")
    _, owner_b_token = await _rematador(client, "botapi-sel1b@example.com")
    bot_b = await _create_bot(client, owner_b_token)
    remate = await _create_remate(client, owner_a_token)

    r = await client.put(
        f"{REMATES_URL}/{remate['id']}/bots/selection",
        json={"bot_profile_ids": [bot_b["id"]]},
        headers=_auth(owner_a_token),
    )
    assert r.status_code == 404, r.text


async def test_set_selection_replaces_full_roster(client: AsyncClient) -> None:
    _, owner_token = await _rematador(client, "botapi-sel2@example.com")
    bot_a = await _create_bot(client, owner_token, display_name="A")
    bot_b = await _create_bot(client, owner_token, display_name="B")
    remate = await _create_remate(client, owner_token)

    r = await client.put(
        f"{REMATES_URL}/{remate['id']}/bots/selection",
        json={"bot_profile_ids": [bot_a["id"], bot_b["id"]]},
        headers=_auth(owner_token),
    )
    assert r.status_code == 204, r.text

    r = await client.put(
        f"{REMATES_URL}/{remate['id']}/bots/selection",
        json={"bot_profile_ids": [bot_b["id"]]},
        headers=_auth(owner_token),
    )
    assert r.status_code == 204, r.text

    r = await client.get(f"{REMATES_URL}/{remate['id']}/bots/roster", headers=_auth(owner_token))
    assert r.status_code == 200, r.text
    roster = r.json()
    assert len(roster) == 1
    assert roster[0]["bot_profile_id"] == bot_b["id"]


# --- Control de simulación (Iniciar/Pausar/Detener) --------------------------------------


async def test_simulation_lifecycle_is_idempotent(client: AsyncClient) -> None:
    _, owner_token = await _rematador(client, "botapi-sim1@example.com")
    bot = await _create_bot(client, owner_token)
    remate = await _create_remate(client, owner_token)
    lote = await _create_lote(client, owner_token, remate["id"])
    await client.put(
        f"{REMATES_URL}/{remate['id']}/bots/selection",
        json={"bot_profile_ids": [bot["id"]]},
        headers=_auth(owner_token),
    )
    await _start_remate_with_open_lote(client, owner_token, remate["id"], lote["id"])

    r = await client.get(f"{REMATES_URL}/{remate['id']}/bots/simulation", headers=_auth(owner_token))
    assert r.status_code == 200, r.text
    assert r.json() is None  # todavía no se inició nunca

    r = await client.post(
        f"{REMATES_URL}/{remate['id']}/bots/simulation/start", headers=_auth(owner_token)
    )
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "running"

    # Idempotente: iniciar de nuevo no rompe nada.
    r = await client.post(
        f"{REMATES_URL}/{remate['id']}/bots/simulation/start", headers=_auth(owner_token)
    )
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "running"

    r = await client.post(
        f"{REMATES_URL}/{remate['id']}/bots/simulation/pause", headers=_auth(owner_token)
    )
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "paused"

    # Idempotente: pausar de nuevo no rompe nada.
    r = await client.post(
        f"{REMATES_URL}/{remate['id']}/bots/simulation/pause", headers=_auth(owner_token)
    )
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "paused"

    r = await client.post(
        f"{REMATES_URL}/{remate['id']}/bots/simulation/stop", headers=_auth(owner_token)
    )
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "stopped"

    # Idempotente: detener de nuevo no rompe nada.
    r = await client.post(
        f"{REMATES_URL}/{remate['id']}/bots/simulation/stop", headers=_auth(owner_token)
    )
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "stopped"


async def test_pause_before_ever_starting_returns_not_found(client: AsyncClient) -> None:
    _, owner_token = await _rematador(client, "botapi-sim2@example.com")
    remate = await _create_remate(client, owner_token)

    r = await client.post(
        f"{REMATES_URL}/{remate['id']}/bots/simulation/pause", headers=_auth(owner_token)
    )
    assert r.status_code == 404, r.text


async def test_set_selection_blocked_while_simulation_running(client: AsyncClient) -> None:
    _, owner_token = await _rematador(client, "botapi-sim3@example.com")
    bot = await _create_bot(client, owner_token)
    remate = await _create_remate(client, owner_token)
    lote = await _create_lote(client, owner_token, remate["id"])
    await client.put(
        f"{REMATES_URL}/{remate['id']}/bots/selection",
        json={"bot_profile_ids": [bot["id"]]},
        headers=_auth(owner_token),
    )
    await _start_remate_with_open_lote(client, owner_token, remate["id"], lote["id"])
    r = await client.post(
        f"{REMATES_URL}/{remate['id']}/bots/simulation/start", headers=_auth(owner_token)
    )
    assert r.status_code == 200, r.text

    r = await client.put(
        f"{REMATES_URL}/{remate['id']}/bots/selection",
        json={"bot_profile_ids": []},
        headers=_auth(owner_token),
    )
    assert r.status_code == 422, r.text

    # Una vez detenida, sí se puede volver a cambiar la selección.
    r = await client.post(
        f"{REMATES_URL}/{remate['id']}/bots/simulation/stop", headers=_auth(owner_token)
    )
    assert r.status_code == 200, r.text
    r = await client.put(
        f"{REMATES_URL}/{remate['id']}/bots/selection",
        json={"bot_profile_ids": []},
        headers=_auth(owner_token),
    )
    assert r.status_code == 204, r.text


async def test_delete_bot_blocked_while_participating_in_active_simulation(
    client: AsyncClient,
) -> None:
    _, owner_token = await _rematador(client, "botapi-sim4@example.com")
    bot = await _create_bot(client, owner_token)
    remate = await _create_remate(client, owner_token)
    lote = await _create_lote(client, owner_token, remate["id"])
    await client.put(
        f"{REMATES_URL}/{remate['id']}/bots/selection",
        json={"bot_profile_ids": [bot["id"]]},
        headers=_auth(owner_token),
    )
    await _start_remate_with_open_lote(client, owner_token, remate["id"], lote["id"])
    r = await client.post(
        f"{REMATES_URL}/{remate['id']}/bots/simulation/start", headers=_auth(owner_token)
    )
    assert r.status_code == 200, r.text

    r = await client.delete(f"{BOTS_URL}/{bot['id']}", headers=_auth(owner_token))
    assert r.status_code == 422, r.text

    r = await client.post(
        f"{REMATES_URL}/{remate['id']}/bots/simulation/stop", headers=_auth(owner_token)
    )
    assert r.status_code == 200, r.text
    r = await client.delete(f"{BOTS_URL}/{bot['id']}", headers=_auth(owner_token))
    assert r.status_code == 204, r.text
