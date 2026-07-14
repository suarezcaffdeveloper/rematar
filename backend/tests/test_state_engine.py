"""Tests de integración del motor de estados (Épica 2, Módulo 2.3).

Cubren: transiciones de Remate (`start`, `pause`, `resume`, `finish`) con sus
precondiciones (RF-08, "no lote abierto"), transiciones de Lote (`open`, `open_next`,
`close`, `cancel`) con las suyas (RF-12, RF-13, congelamiento a `LIVE`/`PAUSED`),
finalización automática del remate al resolverse el último lote (RF-10, ADR-019), y
permisos (ownership, mismo patrón que Módulos 2.1/2.2). No hay ofertas ni datos de
comprador en ningún lado — `close` recibe el resultado declarado manualmente, ver
ADR-018.
"""

from decimal import Decimal

from httpx import AsyncClient

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


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def _create_remate(client: AsyncClient, token: str, **overrides) -> dict:
    payload = {
        "title": "Remate de campo",
        "category": "hacienda",
        "starts_at": "2027-06-01T10:00:00Z",
    }
    payload.update(overrides)
    response = await client.post(REMATES_URL, json=payload, headers=_auth(token))
    assert response.status_code == 201, response.text
    return response.json()


async def _create_lote(client: AsyncClient, token: str, remate_id: str, **overrides) -> dict:
    payload = {
        "lot_number": overrides.pop("lot_number", "1"),
        "title": "Toro Angus",
        "category": "hacienda",
        "base_price": "1000.00",
        "min_increment": "50.00",
    }
    payload.update(overrides)
    response = await client.post(_lotes_url(remate_id), json=payload, headers=_auth(token))
    assert response.status_code == 201, response.text
    return response.json()


async def _schedule(client: AsyncClient, token: str, remate_id: str) -> dict:
    response = await client.post(f"{REMATES_URL}/{remate_id}/schedule", headers=_auth(token))
    assert response.status_code == 200, response.text
    return response.json()


async def _start(client: AsyncClient, token: str, remate_id: str) -> dict:
    response = await client.post(f"{REMATES_URL}/{remate_id}/start", headers=_auth(token))
    assert response.status_code == 200, response.text
    return response.json()


async def _get_remate(client: AsyncClient, token: str, remate_id: str) -> dict:
    response = await client.get(f"{REMATES_URL}/{remate_id}", headers=_auth(token))
    assert response.status_code == 200, response.text
    return response.json()


async def _setup_live_remate_with_lote(
    client: AsyncClient, email: str, **lote_overrides
) -> tuple[str, str, str]:
    """Rematador con un remate LIVE y un lote PENDING. Devuelve (token, remate_id, lote_id)."""
    token = await _register_and_login(client, email=email, role="rematador")
    remate = await _create_remate(client, token)
    lote = await _create_lote(client, token, remate["id"], **lote_overrides)
    await _schedule(client, token, remate["id"])
    await _start(client, token, remate["id"])
    return token, remate["id"], lote["id"]


# --- Remate: start -------------------------------------------------------------------


async def test_cannot_start_remate_without_lotes(client: AsyncClient) -> None:
    token = await _register_and_login(client, email="rematador1@example.com", role="rematador")
    remate = await _create_remate(client, token)
    await _schedule(client, token, remate["id"])

    response = await client.post(f"{REMATES_URL}/{remate['id']}/start", headers=_auth(token))
    assert response.status_code == 422


async def test_can_start_remate_with_lote(client: AsyncClient) -> None:
    token = await _register_and_login(client, email="rematador2@example.com", role="rematador")
    remate = await _create_remate(client, token)
    await _create_lote(client, token, remate["id"])
    await _schedule(client, token, remate["id"])

    response = await client.post(f"{REMATES_URL}/{remate['id']}/start", headers=_auth(token))
    assert response.status_code == 200
    assert response.json()["status"] == "live"


async def test_cannot_start_remate_still_in_draft(client: AsyncClient) -> None:
    token = await _register_and_login(client, email="rematador3@example.com", role="rematador")
    remate = await _create_remate(client, token)
    await _create_lote(client, token, remate["id"])

    response = await client.post(f"{REMATES_URL}/{remate['id']}/start", headers=_auth(token))
    assert response.status_code == 422


async def test_non_owner_cannot_start_remate(client: AsyncClient) -> None:
    owner_token = await _register_and_login(
        client, email="rematador4@example.com", role="rematador"
    )
    remate = await _create_remate(client, owner_token)
    await _create_lote(client, owner_token, remate["id"])
    await _schedule(client, owner_token, remate["id"])

    other_token = await _register_and_login(
        client, email="rematador5@example.com", role="rematador"
    )
    response = await client.post(f"{REMATES_URL}/{remate['id']}/start", headers=_auth(other_token))
    assert response.status_code == 403


# --- Remate: pause / resume ------------------------------------------------------------


async def test_pause_and_resume(client: AsyncClient) -> None:
    token, remate_id, _ = await _setup_live_remate_with_lote(client, "rematador6@example.com")

    pause_response = await client.post(f"{REMATES_URL}/{remate_id}/pause", headers=_auth(token))
    assert pause_response.status_code == 200
    assert pause_response.json()["status"] == "paused"

    resume_response = await client.post(f"{REMATES_URL}/{remate_id}/resume", headers=_auth(token))
    assert resume_response.status_code == 200
    assert resume_response.json()["status"] == "live"


async def test_cannot_pause_remate_not_live(client: AsyncClient) -> None:
    token = await _register_and_login(client, email="rematador7@example.com", role="rematador")
    remate = await _create_remate(client, token)
    await _create_lote(client, token, remate["id"])
    await _schedule(client, token, remate["id"])

    response = await client.post(f"{REMATES_URL}/{remate['id']}/pause", headers=_auth(token))
    assert response.status_code == 422


async def test_cannot_resume_remate_not_paused(client: AsyncClient) -> None:
    token, remate_id, _ = await _setup_live_remate_with_lote(client, "rematador8@example.com")

    response = await client.post(f"{REMATES_URL}/{remate_id}/resume", headers=_auth(token))
    assert response.status_code == 422


# --- Remate: finish --------------------------------------------------------------------


async def test_finish_requires_no_open_lote(client: AsyncClient) -> None:
    token, remate_id, lote_id = await _setup_live_remate_with_lote(client, "rematador9@example.com")
    open_response = await client.post(
        f"{_lotes_url(remate_id)}/{lote_id}/open", headers=_auth(token)
    )
    assert open_response.status_code == 200

    response = await client.post(f"{REMATES_URL}/{remate_id}/finish", headers=_auth(token))
    assert response.status_code == 422


async def test_finish_allowed_with_only_pending_lote(client: AsyncClient) -> None:
    """La regla explícita solo bloquea con un lote OPEN; un PENDING nunca abierto no
    impide finalizar el remate manualmente."""
    token, remate_id, _lote_id = await _setup_live_remate_with_lote(
        client, "rematador10@example.com"
    )

    response = await client.post(f"{REMATES_URL}/{remate_id}/finish", headers=_auth(token))
    assert response.status_code == 200
    assert response.json()["status"] == "finished"


async def test_finish_from_paused_is_invalid(client: AsyncClient) -> None:
    token, remate_id, _lote_id = await _setup_live_remate_with_lote(
        client, "rematador11@example.com"
    )
    await client.post(f"{REMATES_URL}/{remate_id}/pause", headers=_auth(token))

    response = await client.post(f"{REMATES_URL}/{remate_id}/finish", headers=_auth(token))
    assert response.status_code == 422


# --- Lote: open --------------------------------------------------------------------


async def test_cannot_open_lote_before_remate_is_live(client: AsyncClient) -> None:
    token = await _register_and_login(client, email="rematador12@example.com", role="rematador")
    remate = await _create_remate(client, token)
    lote = await _create_lote(client, token, remate["id"])
    await _schedule(client, token, remate["id"])

    response = await client.post(
        f"{_lotes_url(remate['id'])}/{lote['id']}/open", headers=_auth(token)
    )
    assert response.status_code == 422


async def test_open_lote_success(client: AsyncClient) -> None:
    token, remate_id, lote_id = await _setup_live_remate_with_lote(
        client, "rematador13@example.com"
    )

    response = await client.post(
        f"{_lotes_url(remate_id)}/{lote_id}/open", headers=_auth(token)
    )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "open"
    assert body["opened_at"] is not None


async def test_cannot_open_second_lote_while_one_open(client: AsyncClient) -> None:
    token = await _register_and_login(client, email="rematador14@example.com", role="rematador")
    remate = await _create_remate(client, token)
    lote_a = await _create_lote(client, token, remate["id"], lot_number="1")
    lote_b = await _create_lote(client, token, remate["id"], lot_number="2")
    await _schedule(client, token, remate["id"])
    await _start(client, token, remate["id"])

    await client.post(f"{_lotes_url(remate['id'])}/{lote_a['id']}/open", headers=_auth(token))
    response = await client.post(
        f"{_lotes_url(remate['id'])}/{lote_b['id']}/open", headers=_auth(token)
    )
    assert response.status_code == 422


async def test_open_next_opens_lowest_display_order(client: AsyncClient) -> None:
    token = await _register_and_login(client, email="rematador15@example.com", role="rematador")
    remate = await _create_remate(client, token)
    first = await _create_lote(client, token, remate["id"], lot_number="1")
    await _create_lote(client, token, remate["id"], lot_number="2")
    await _schedule(client, token, remate["id"])
    await _start(client, token, remate["id"])

    response = await client.post(f"{_lotes_url(remate['id'])}/next", headers=_auth(token))
    assert response.status_code == 200
    body = response.json()
    assert body["id"] == first["id"]
    assert body["status"] == "open"


async def test_open_next_fails_when_none_pending(client: AsyncClient) -> None:
    token, remate_id, lote_id = await _setup_live_remate_with_lote(
        client, "rematador16@example.com"
    )
    await client.post(f"{_lotes_url(remate_id)}/{lote_id}/open", headers=_auth(token))
    await client.post(
        f"{_lotes_url(remate_id)}/{lote_id}/close",
        json={"outcome": "unsold"},
        headers=_auth(token),
    )

    response = await client.post(f"{_lotes_url(remate_id)}/next", headers=_auth(token))
    assert response.status_code == 422


async def test_cannot_open_lote_belonging_to_another_remate(client: AsyncClient) -> None:
    token = await _register_and_login(client, email="rematador17@example.com", role="rematador")
    remate_a = await _create_remate(client, token, title="Remate A")
    await _create_lote(client, token, remate_a["id"])
    await _schedule(client, token, remate_a["id"])
    await _start(client, token, remate_a["id"])

    remate_b = await _create_remate(client, token, title="Remate B")
    lote_b = await _create_lote(client, token, remate_b["id"])
    await _schedule(client, token, remate_b["id"])
    await _start(client, token, remate_b["id"])

    response = await client.post(
        f"{_lotes_url(remate_a['id'])}/{lote_b['id']}/open", headers=_auth(token)
    )
    assert response.status_code == 404


async def test_non_owner_cannot_open_lote(client: AsyncClient) -> None:
    owner_token, remate_id, lote_id = await _setup_live_remate_with_lote(
        client, "rematador18@example.com"
    )
    other_token = await _register_and_login(
        client, email="rematador19@example.com", role="rematador"
    )

    response = await client.post(
        f"{_lotes_url(remate_id)}/{lote_id}/open", headers=_auth(other_token)
    )
    assert response.status_code == 403


# --- Lote: close -------------------------------------------------------------------


async def test_close_sold_requires_final_price(client: AsyncClient) -> None:
    token, remate_id, lote_id = await _setup_live_remate_with_lote(
        client, "rematador20@example.com"
    )
    await client.post(f"{_lotes_url(remate_id)}/{lote_id}/open", headers=_auth(token))

    response = await client.post(
        f"{_lotes_url(remate_id)}/{lote_id}/close",
        json={"outcome": "sold"},
        headers=_auth(token),
    )
    assert response.status_code == 422


async def test_close_unsold_rejects_final_price(client: AsyncClient) -> None:
    token, remate_id, lote_id = await _setup_live_remate_with_lote(
        client, "rematador21@example.com"
    )
    await client.post(f"{_lotes_url(remate_id)}/{lote_id}/open", headers=_auth(token))

    response = await client.post(
        f"{_lotes_url(remate_id)}/{lote_id}/close",
        json={"outcome": "unsold", "final_price": "1200.00"},
        headers=_auth(token),
    )
    assert response.status_code == 422


async def test_close_sold_final_price_below_base_rejected(client: AsyncClient) -> None:
    token, remate_id, lote_id = await _setup_live_remate_with_lote(
        client, "rematador22@example.com"
    )
    await client.post(f"{_lotes_url(remate_id)}/{lote_id}/open", headers=_auth(token))

    response = await client.post(
        f"{_lotes_url(remate_id)}/{lote_id}/close",
        json={"outcome": "sold", "final_price": "500.00"},
        headers=_auth(token),
    )
    assert response.status_code == 422


async def test_close_sold_success(client: AsyncClient) -> None:
    token, remate_id, lote_id = await _setup_live_remate_with_lote(
        client, "rematador23@example.com"
    )
    await client.post(f"{_lotes_url(remate_id)}/{lote_id}/open", headers=_auth(token))

    response = await client.post(
        f"{_lotes_url(remate_id)}/{lote_id}/close",
        json={"outcome": "sold", "final_price": "1500.00"},
        headers=_auth(token),
    )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "closed_sold"
    assert Decimal(str(body["final_price"])) == Decimal("1500.00")
    assert body["closed_at"] is not None


async def test_close_unsold_success(client: AsyncClient) -> None:
    token, remate_id, lote_id = await _setup_live_remate_with_lote(
        client, "rematador24@example.com"
    )
    await client.post(f"{_lotes_url(remate_id)}/{lote_id}/open", headers=_auth(token))

    response = await client.post(
        f"{_lotes_url(remate_id)}/{lote_id}/close",
        json={"outcome": "unsold"},
        headers=_auth(token),
    )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "closed_unsold"
    assert body["final_price"] is None


async def test_cannot_close_lote_not_open(client: AsyncClient) -> None:
    token, remate_id, lote_id = await _setup_live_remate_with_lote(
        client, "rematador25@example.com"
    )

    response = await client.post(
        f"{_lotes_url(remate_id)}/{lote_id}/close",
        json={"outcome": "unsold"},
        headers=_auth(token),
    )
    assert response.status_code == 422


async def test_non_owner_cannot_close_lote(client: AsyncClient) -> None:
    owner_token, remate_id, lote_id = await _setup_live_remate_with_lote(
        client, "rematador26@example.com"
    )
    await client.post(f"{_lotes_url(remate_id)}/{lote_id}/open", headers=_auth(owner_token))
    other_token = await _register_and_login(
        client, email="rematador27@example.com", role="rematador"
    )

    response = await client.post(
        f"{_lotes_url(remate_id)}/{lote_id}/close",
        json={"outcome": "unsold"},
        headers=_auth(other_token),
    )
    assert response.status_code == 403


# --- Lote: cancel ------------------------------------------------------------------


async def test_cancel_lote_requires_reason(client: AsyncClient) -> None:
    token, remate_id, lote_id = await _setup_live_remate_with_lote(
        client, "rematador28@example.com"
    )

    response = await client.post(
        f"{_lotes_url(remate_id)}/{lote_id}/cancel", json={}, headers=_auth(token)
    )
    assert response.status_code == 422


async def test_cancel_pending_lote_success(client: AsyncClient) -> None:
    token, remate_id, lote_id = await _setup_live_remate_with_lote(
        client, "rematador29@example.com"
    )

    response = await client.post(
        f"{_lotes_url(remate_id)}/{lote_id}/cancel",
        json={"reason": "El animal se retiró del remate."},
        headers=_auth(token),
    )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "cancelled"
    assert body["cancellation_reason"] == "El animal se retiró del remate."
    assert body["cancelled_at"] is not None


async def test_cancel_open_lote_success(client: AsyncClient) -> None:
    token, remate_id, lote_id = await _setup_live_remate_with_lote(
        client, "rematador30@example.com"
    )
    await client.post(f"{_lotes_url(remate_id)}/{lote_id}/open", headers=_auth(token))

    response = await client.post(
        f"{_lotes_url(remate_id)}/{lote_id}/cancel",
        json={"reason": "Problema sanitario detectado."},
        headers=_auth(token),
    )
    assert response.status_code == 200
    assert response.json()["status"] == "cancelled"


async def test_cannot_cancel_lote_before_remate_is_live(client: AsyncClient) -> None:
    token = await _register_and_login(client, email="rematador31@example.com", role="rematador")
    remate = await _create_remate(client, token)
    lote = await _create_lote(client, token, remate["id"])
    await _schedule(client, token, remate["id"])

    response = await client.post(
        f"{_lotes_url(remate['id'])}/{lote['id']}/cancel",
        json={"reason": "Motivo cualquiera."},
        headers=_auth(token),
    )
    assert response.status_code == 422


async def test_non_owner_cannot_cancel_lote(client: AsyncClient) -> None:
    owner_token, remate_id, lote_id = await _setup_live_remate_with_lote(
        client, "rematador32@example.com"
    )
    other_token = await _register_and_login(
        client, email="rematador33@example.com", role="rematador"
    )

    response = await client.post(
        f"{_lotes_url(remate_id)}/{lote_id}/cancel",
        json={"reason": "Intento ajeno."},
        headers=_auth(other_token),
    )
    assert response.status_code == 403


# --- Finalización automática (RF-10, ADR-019) -----------------------------------------


async def test_auto_finish_when_closing_the_only_lote(client: AsyncClient) -> None:
    token, remate_id, lote_id = await _setup_live_remate_with_lote(
        client, "rematador34@example.com"
    )
    await client.post(f"{_lotes_url(remate_id)}/{lote_id}/open", headers=_auth(token))

    await client.post(
        f"{_lotes_url(remate_id)}/{lote_id}/close",
        json={"outcome": "sold", "final_price": "1200.00"},
        headers=_auth(token),
    )

    remate = await _get_remate(client, token, remate_id)
    assert remate["status"] == "finished"
    assert remate["finished_at"] is not None


async def test_auto_finish_via_cancel_of_only_lote(client: AsyncClient) -> None:
    token, remate_id, lote_id = await _setup_live_remate_with_lote(
        client, "rematador35@example.com"
    )

    await client.post(
        f"{_lotes_url(remate_id)}/{lote_id}/cancel",
        json={"reason": "Se retira antes de abrirse."},
        headers=_auth(token),
    )

    remate = await _get_remate(client, token, remate_id)
    assert remate["status"] == "finished"


async def test_no_auto_finish_while_lote_pending(client: AsyncClient) -> None:
    token = await _register_and_login(client, email="rematador36@example.com", role="rematador")
    remate = await _create_remate(client, token)
    lote_a = await _create_lote(client, token, remate["id"], lot_number="1")
    await _create_lote(client, token, remate["id"], lot_number="2")
    await _schedule(client, token, remate["id"])
    await _start(client, token, remate["id"])

    await client.post(f"{_lotes_url(remate['id'])}/{lote_a['id']}/open", headers=_auth(token))
    await client.post(
        f"{_lotes_url(remate['id'])}/{lote_a['id']}/close",
        json={"outcome": "unsold"},
        headers=_auth(token),
    )

    remate_after = await _get_remate(client, token, remate["id"])
    assert remate_after["status"] == "live"


async def test_no_auto_finish_while_remate_paused(client: AsyncClient) -> None:
    token, remate_id, lote_id = await _setup_live_remate_with_lote(
        client, "rematador37@example.com"
    )
    await client.post(f"{_lotes_url(remate_id)}/{lote_id}/open", headers=_auth(token))
    await client.post(f"{REMATES_URL}/{remate_id}/pause", headers=_auth(token))

    close_response = await client.post(
        f"{_lotes_url(remate_id)}/{lote_id}/close",
        json={"outcome": "unsold"},
        headers=_auth(token),
    )
    assert close_response.status_code == 200

    remate_after = await _get_remate(client, token, remate_id)
    assert remate_after["status"] == "paused"
