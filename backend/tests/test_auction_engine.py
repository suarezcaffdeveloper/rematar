"""Tests de integración del Auction Engine (Épica 2.4).

Cubren: aceptación/rechazo de ofertas según cada regla (dura y blanda, ver
docs/17-auction-engine.md), la transición automática `ACCEPTED -> OUTBID` al superar la
oferta vigente, idempotencia vía `client_token`, la oferta vigente (`/leading`) y el
historial completo (`GET .../ofertas`, solo dueño/admin).
"""

import asyncio
from decimal import Decimal

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.modules.users.models import User, UserRole
from tests._role_test_helpers import activate_pending_account

REGISTER_URL = "/api/v1/auth/register"
LOGIN_URL = "/api/v1/auth/login"
REMATES_URL = "/api/v1/remates"
USERS_URL = "/api/v1/users"


def _lotes_url(remate_id: str) -> str:
    return f"{REMATES_URL}/{remate_id}/lotes"


def _ofertas_url(remate_id: str, lote_id: str) -> str:
    return f"{_lotes_url(remate_id)}/{lote_id}/ofertas"


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


async def _register_and_get_id_and_token(
    client: AsyncClient, *, email: str, role: str
) -> tuple[str, str]:
    register = await client.post(
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
    user_id = register.json()["id"]
    login = await client.post(LOGIN_URL, data={"username": email, "password": "password123"})
    assert login.status_code == 200, login.text
    return user_id, login.json()["access_token"]


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
        "min_increment": "100.00",
    }
    payload.update(overrides)
    response = await client.post(_lotes_url(remate_id), json=payload, headers=_auth(token))
    assert response.status_code == 201, response.text
    return response.json()


async def _setup_open_lote(
    client: AsyncClient, owner_email: str, **lote_overrides
) -> tuple[str, str, str]:
    """Rematador con un remate LIVE y un lote OPEN. Devuelve (owner_token, remate_id, lote_id)."""
    owner_token = await _register_and_login(client, email=owner_email, role="empresa")
    remate = await _create_remate(client, owner_token)
    lote = await _create_lote(client, owner_token, remate["id"], **lote_overrides)
    schedule = await client.post(
        f"{REMATES_URL}/{remate['id']}/schedule", headers=_auth(owner_token)
    )
    assert schedule.status_code == 200, schedule.text
    start = await client.post(f"{REMATES_URL}/{remate['id']}/start", headers=_auth(owner_token))
    assert start.status_code == 200, start.text
    open_response = await client.post(
        f"{_lotes_url(remate['id'])}/{lote['id']}/open", headers=_auth(owner_token)
    )
    assert open_response.status_code == 200, open_response.text
    return owner_token, remate["id"], lote["id"]


async def _bid(
    client: AsyncClient,
    token: str,
    remate_id: str,
    lote_id: str,
    amount: str,
    client_token: str | None = None,
):
    payload: dict = {"amount": amount}
    if client_token is not None:
        payload["client_token"] = client_token
    return await client.post(_ofertas_url(remate_id, lote_id), json=payload, headers=_auth(token))


# --- Aceptación y outbid -------------------------------------------------------------


async def test_comprador_can_place_valid_first_bid(client: AsyncClient) -> None:
    _owner_token, remate_id, lote_id = await _setup_open_lote(client, "rematador1@example.com")
    comprador_token = await _register_and_login(
        client, email="comprador1@example.com", role="comprador"
    )

    response = await _bid(client, comprador_token, remate_id, lote_id, "1000.00")
    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "accepted"
    assert Decimal(str(body["amount"])) == Decimal("1000.00")
    assert body["rejection_reason"] is None


async def test_first_bid_below_base_price_rejected(client: AsyncClient) -> None:
    _owner_token, remate_id, lote_id = await _setup_open_lote(client, "rematador2@example.com")
    comprador_token = await _register_and_login(
        client, email="comprador2@example.com", role="comprador"
    )

    response = await _bid(client, comprador_token, remate_id, lote_id, "500.00")
    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "rejected"
    assert body["rejection_reason"] is not None


async def test_second_bid_below_min_increment_rejected(client: AsyncClient) -> None:
    _owner_token, remate_id, lote_id = await _setup_open_lote(client, "rematador3@example.com")
    comprador_a = await _register_and_login(
        client, email="comprador3a@example.com", role="comprador"
    )
    comprador_b = await _register_and_login(
        client, email="comprador3b@example.com", role="comprador"
    )

    first = await _bid(client, comprador_a, remate_id, lote_id, "1000.00")
    assert first.json()["status"] == "accepted"

    second = await _bid(client, comprador_b, remate_id, lote_id, "1050.00")
    assert second.status_code == 201
    assert second.json()["status"] == "rejected"


async def test_second_bid_meeting_increment_outbids_first(client: AsyncClient) -> None:
    owner_token, remate_id, lote_id = await _setup_open_lote(client, "rematador4@example.com")
    comprador_a = await _register_and_login(
        client, email="comprador4a@example.com", role="comprador"
    )
    comprador_b = await _register_and_login(
        client, email="comprador4b@example.com", role="comprador"
    )

    first = await _bid(client, comprador_a, remate_id, lote_id, "1000.00")
    first_id = first.json()["id"]

    second = await _bid(client, comprador_b, remate_id, lote_id, "1100.00")
    assert second.status_code == 201
    assert second.json()["status"] == "accepted"

    history = await client.get(_ofertas_url(remate_id, lote_id), headers=_auth(owner_token))
    assert history.status_code == 200
    by_id = {item["id"]: item["status"] for item in history.json()["items"]}
    assert by_id[first_id] == "outbid"
    assert by_id[second.json()["id"]] == "accepted"


async def test_two_concurrent_bids_are_serialized_by_the_row_lock(client: AsyncClient) -> None:
    """Dos compradores ofertando *al mismo tiempo* (`asyncio.gather`, no secuencial como
    el resto de este archivo) -- verifica el invariante de RNF-09 bajo concurrencia
    real, no solo bajo una simulación secuencial: el `SELECT ... FOR UPDATE` de
    `LoteRepository.get_by_id_for_update` (ADR-004) serializa ambas transacciones sobre
    la misma fila de lote, sin importar cuál llegue primero al proceso.

    Los montos se eligen para que el resultado tenga un invariante verificable pase lo
    que pase con el orden real de ejecución (no controlable desde el test): la oferta
    de $1200 siempre termina `accepted` (le alcanza para ganar sin importar si la de
    $1000 se procesó antes o después), y la de $1000 termina `outbid` (si se procesó
    primero y después la superaron) o `rejected` (si se procesó después de la de $1200,
    ya no alcanza el incremento mínimo) -- nunca `accepted` ella también, que sería la
    violación de RNF-09 (dos ofertas "vigentes" contradictorias)."""
    owner_token, remate_id, lote_id = await _setup_open_lote(client, "rematador4c@example.com")
    comprador_a = await _register_and_login(
        client, email="comprador4c-a@example.com", role="comprador"
    )
    comprador_b = await _register_and_login(
        client, email="comprador4c-b@example.com", role="comprador"
    )

    response_a, response_b = await asyncio.gather(
        _bid(client, comprador_a, remate_id, lote_id, "1000.00"),
        _bid(client, comprador_b, remate_id, lote_id, "1200.00"),
    )

    assert response_a.status_code == 201, response_a.text
    assert response_b.status_code == 201, response_b.text

    # OJO: no se evalúa `status` sobre `response_a.json()`/`response_b.json()` --
    # son la foto del momento en que CADA respuesta se generó (ADR-020, sección D: el
    # cuerpo siempre 201, el resultado va adentro), y si la otra oferta llega después
    # y la supera, esa foto queda vieja (no se vuelve a serializar). El estado final
    # real hay que leerlo del historial, igual que ya hace
    # `test_second_bid_meeting_increment_outbids_first` de acá arriba.
    history = await client.get(_ofertas_url(remate_id, lote_id), headers=_auth(owner_token))
    assert history.status_code == 200
    items = history.json()["items"]
    assert len(items) == 2, "Ambas ofertas deben quedar persistidas, ninguna perdida"

    accepted = [item for item in items if item["status"] == "accepted"]
    assert len(accepted) == 1, "Debe haber exactamente una oferta vigente, nunca dos ni cero (RNF-09)"
    assert Decimal(str(accepted[0]["amount"])) == Decimal("1200.00")

    other = [item for item in items if item["id"] != accepted[0]["id"]][0]
    assert other["status"] in ("outbid", "rejected")


# --- Reglas duras ----------------------------------------------------------------------


async def test_rematador_cannot_bid(client: AsyncClient) -> None:
    _owner_token, remate_id, lote_id = await _setup_open_lote(client, "rematador5@example.com")
    other_rematador = await _register_and_login(
        client, email="rematador5b@example.com", role="empresa"
    )

    response = await _bid(client, other_rematador, remate_id, lote_id, "1000.00")
    assert response.status_code == 403


async def test_admin_cannot_bid(client: AsyncClient, db_session: AsyncSession) -> None:
    _owner_token, remate_id, lote_id = await _setup_open_lote(client, "rematador6@example.com")
    admin_token = await _create_admin_and_login(client, db_session, "admin1@example.com")

    response = await _bid(client, admin_token, remate_id, lote_id, "1000.00")
    assert response.status_code == 403


async def test_suspended_comprador_cannot_bid(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """`get_current_user` (capa de auth, sin cambios) ya revalida `is_active` en cada
    request y corta con 401 antes de que la solicitud llegue al Auction Engine — el
    chequeo propio del motor (`AuctionEngine.place_bid`, "el comprador está suspendido")
    es una segunda capa de defensa para cuando el motor reciba un `User` que el caller
    no garantice fresco (ej. una futura conexión de WebSocket con sesión cacheada), y no
    es observable vía HTTP hoy porque la primera capa ya intercepta antes."""
    _owner_token, remate_id, lote_id = await _setup_open_lote(client, "rematador7@example.com")
    comprador_id, comprador_token = await _register_and_get_id_and_token(
        client, email="comprador7@example.com", role="comprador"
    )
    admin_token = await _create_admin_and_login(client, db_session, "admin2@example.com")

    suspend = await client.patch(
        f"{USERS_URL}/{comprador_id}/status",
        json={"is_active": False},
        headers=_auth(admin_token),
    )
    assert suspend.status_code == 200

    response = await _bid(client, comprador_token, remate_id, lote_id, "1000.00")
    assert response.status_code == 401


async def test_bid_on_draft_remate_returns_404(client: AsyncClient) -> None:
    owner_token = await _register_and_login(
        client, email="rematador8@example.com", role="empresa"
    )
    remate = await _create_remate(client, owner_token)
    lote = await _create_lote(client, owner_token, remate["id"])
    comprador_token = await _register_and_login(
        client, email="comprador8@example.com", role="comprador"
    )

    response = await _bid(client, comprador_token, remate["id"], lote["id"], "1000.00")
    assert response.status_code == 404


async def test_bid_on_lote_from_another_remate_returns_404(client: AsyncClient) -> None:
    owner_token = await _register_and_login(
        client, email="rematador9@example.com", role="empresa"
    )
    remate_a = await _create_remate(client, owner_token, title="Remate A")
    await _create_lote(client, owner_token, remate_a["id"])
    await client.post(f"{REMATES_URL}/{remate_a['id']}/schedule", headers=_auth(owner_token))
    await client.post(f"{REMATES_URL}/{remate_a['id']}/start", headers=_auth(owner_token))

    remate_b = await _create_remate(client, owner_token, title="Remate B")
    lote_b = await _create_lote(client, owner_token, remate_b["id"])
    await client.post(f"{REMATES_URL}/{remate_b['id']}/schedule", headers=_auth(owner_token))
    await client.post(f"{REMATES_URL}/{remate_b['id']}/start", headers=_auth(owner_token))
    await client.post(
        f"{_lotes_url(remate_b['id'])}/{lote_b['id']}/open", headers=_auth(owner_token)
    )

    comprador_token = await _register_and_login(
        client, email="comprador9@example.com", role="comprador"
    )
    response = await _bid(client, comprador_token, remate_a["id"], lote_b["id"], "1000.00")
    assert response.status_code == 404


# --- Reglas blandas ----------------------------------------------------------------


async def test_bid_when_remate_not_started_rejected(client: AsyncClient) -> None:
    owner_token = await _register_and_login(
        client, email="rematador10@example.com", role="empresa"
    )
    remate = await _create_remate(client, owner_token)
    lote = await _create_lote(client, owner_token, remate["id"])
    await client.post(f"{REMATES_URL}/{remate['id']}/schedule", headers=_auth(owner_token))

    comprador_token = await _register_and_login(
        client, email="comprador10@example.com", role="comprador"
    )
    response = await _bid(client, comprador_token, remate["id"], lote["id"], "1000.00")
    assert response.status_code == 201
    assert response.json()["status"] == "rejected"


async def test_bid_when_remate_paused_rejected(client: AsyncClient) -> None:
    owner_token, remate_id, lote_id = await _setup_open_lote(client, "rematador11@example.com")
    pause = await client.post(f"{REMATES_URL}/{remate_id}/pause", headers=_auth(owner_token))
    assert pause.status_code == 200

    comprador_token = await _register_and_login(
        client, email="comprador11@example.com", role="comprador"
    )
    response = await _bid(client, comprador_token, remate_id, lote_id, "1000.00")
    assert response.status_code == 201
    assert response.json()["status"] == "rejected"


async def test_bid_when_remate_finished_rejected(client: AsyncClient) -> None:
    """El sentido más literal de "remate cerrado": a diferencia de
    `test_bid_when_remate_not_started_rejected` (nunca estuvo LIVE) y
    `test_bid_when_remate_paused_rejected` (LIVE pero pausado), acá el remate
    efectivamente estuvo LIVE y terminó en FINISHED de verdad -- cerrando el único lote
    y finalizando el remate a mano (`POST .../finish`): ya no hay finalización
    automática al cerrarse el último lote (ex RF-10, ver `test_state_engine.py`)."""
    owner_token, remate_id, lote_id = await _setup_open_lote(client, "rematador11b@example.com")
    close = await client.post(
        f"{_lotes_url(remate_id)}/{lote_id}/close",
        json={"outcome": "unsold"},
        headers=_auth(owner_token),
    )
    assert close.status_code == 200

    finish = await client.post(f"{REMATES_URL}/{remate_id}/finish", headers=_auth(owner_token))
    assert finish.status_code == 200

    remate = await client.get(f"{REMATES_URL}/{remate_id}", headers=_auth(owner_token))
    assert remate.status_code == 200
    assert remate.json()["status"] == "finished"

    comprador_token = await _register_and_login(
        client, email="comprador11b@example.com", role="comprador"
    )
    response = await _bid(client, comprador_token, remate_id, lote_id, "1000.00")
    assert response.status_code == 201
    assert response.json()["status"] == "rejected"
    assert response.json()["rejection_reason"] == "El remate no está en vivo."


async def test_bid_on_pending_lote_rejected(client: AsyncClient) -> None:
    owner_token = await _register_and_login(
        client, email="rematador12@example.com", role="empresa"
    )
    remate = await _create_remate(client, owner_token)
    lote = await _create_lote(client, owner_token, remate["id"])
    await client.post(f"{REMATES_URL}/{remate['id']}/schedule", headers=_auth(owner_token))
    await client.post(f"{REMATES_URL}/{remate['id']}/start", headers=_auth(owner_token))
    # Nunca se abre el lote: sigue PENDING.

    comprador_token = await _register_and_login(
        client, email="comprador12@example.com", role="comprador"
    )
    response = await _bid(client, comprador_token, remate["id"], lote["id"], "1000.00")
    assert response.status_code == 201
    assert response.json()["status"] == "rejected"


async def test_bid_on_closed_lote_rejected(client: AsyncClient) -> None:
    owner_token, remate_id, lote_id = await _setup_open_lote(client, "rematador13@example.com")
    close = await client.post(
        f"{_lotes_url(remate_id)}/{lote_id}/close",
        json={"outcome": "unsold"},
        headers=_auth(owner_token),
    )
    assert close.status_code == 200

    comprador_token = await _register_and_login(
        client, email="comprador13@example.com", role="comprador"
    )
    response = await _bid(client, comprador_token, remate_id, lote_id, "1000.00")
    assert response.status_code == 201
    assert response.json()["status"] == "rejected"


# --- Validación de esquema ----------------------------------------------------------


async def test_amount_must_be_positive(client: AsyncClient) -> None:
    _owner_token, remate_id, lote_id = await _setup_open_lote(client, "rematador14@example.com")
    comprador_token = await _register_and_login(
        client, email="comprador14@example.com", role="comprador"
    )

    response = await _bid(client, comprador_token, remate_id, lote_id, "0")
    assert response.status_code == 422


# --- Idempotencia --------------------------------------------------------------------


async def test_duplicate_client_token_returns_same_offer(client: AsyncClient) -> None:
    _owner_token, remate_id, lote_id = await _setup_open_lote(client, "rematador15@example.com")
    comprador_token = await _register_and_login(
        client, email="comprador15@example.com", role="comprador"
    )

    first = await _bid(
        client, comprador_token, remate_id, lote_id, "1000.00", client_token="retry-1"
    )
    second = await _bid(
        client, comprador_token, remate_id, lote_id, "1000.00", client_token="retry-1"
    )
    assert first.status_code == 201
    assert second.status_code == 201
    assert first.json()["id"] == second.json()["id"]


async def test_different_client_token_creates_new_offer(client: AsyncClient) -> None:
    owner_token, remate_id, lote_id = await _setup_open_lote(client, "rematador16@example.com")
    comprador_token = await _register_and_login(
        client, email="comprador16@example.com", role="comprador"
    )

    first = await _bid(
        client, comprador_token, remate_id, lote_id, "1000.00", client_token="tok-a"
    )
    second = await _bid(
        client, comprador_token, remate_id, lote_id, "1200.00", client_token="tok-b"
    )
    assert first.json()["id"] != second.json()["id"]

    history = await client.get(_ofertas_url(remate_id, lote_id), headers=_auth(owner_token))
    assert history.json()["total"] == 2


# --- Oferta vigente (/leading) ---------------------------------------------------------


async def test_leading_offer_null_when_no_bids(client: AsyncClient) -> None:
    _owner_token, remate_id, lote_id = await _setup_open_lote(client, "rematador17@example.com")
    comprador_token = await _register_and_login(
        client, email="comprador17@example.com", role="comprador"
    )

    response = await client.get(
        f"{_ofertas_url(remate_id, lote_id)}/leading", headers=_auth(comprador_token)
    )
    assert response.status_code == 200
    assert response.json()["amount"] is None


async def test_leading_offer_reflects_current_leader(client: AsyncClient) -> None:
    _owner_token, remate_id, lote_id = await _setup_open_lote(client, "rematador18@example.com")
    comprador_a = await _register_and_login(
        client, email="comprador18a@example.com", role="comprador"
    )
    comprador_b = await _register_and_login(
        client, email="comprador18b@example.com", role="comprador"
    )

    await _bid(client, comprador_a, remate_id, lote_id, "1000.00")
    await _bid(client, comprador_b, remate_id, lote_id, "1200.00")

    response = await client.get(
        f"{_ofertas_url(remate_id, lote_id)}/leading", headers=_auth(comprador_a)
    )
    assert response.status_code == 200
    assert Decimal(str(response.json()["amount"])) == Decimal("1200.00")


# --- Historial -------------------------------------------------------------------------


async def test_owner_can_list_history_including_rejected(client: AsyncClient) -> None:
    owner_token, remate_id, lote_id = await _setup_open_lote(client, "rematador19@example.com")
    comprador_token = await _register_and_login(
        client, email="comprador19@example.com", role="comprador"
    )
    await _bid(client, comprador_token, remate_id, lote_id, "500.00")  # rechazada
    await _bid(client, comprador_token, remate_id, lote_id, "1000.00")  # aceptada

    response = await client.get(_ofertas_url(remate_id, lote_id), headers=_auth(owner_token))
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 2
    statuses = {item["status"] for item in body["items"]}
    assert statuses == {"rejected", "accepted"}


async def test_admin_can_list_history(client: AsyncClient, db_session: AsyncSession) -> None:
    _owner_token, remate_id, lote_id = await _setup_open_lote(client, "rematador20@example.com")
    comprador_token = await _register_and_login(
        client, email="comprador20@example.com", role="comprador"
    )
    await _bid(client, comprador_token, remate_id, lote_id, "1000.00")
    admin_token = await _create_admin_and_login(client, db_session, "admin3@example.com")

    response = await client.get(_ofertas_url(remate_id, lote_id), headers=_auth(admin_token))
    assert response.status_code == 200
    assert response.json()["total"] == 1


async def test_comprador_cannot_list_history(client: AsyncClient) -> None:
    _owner_token, remate_id, lote_id = await _setup_open_lote(client, "rematador21@example.com")
    comprador_token = await _register_and_login(
        client, email="comprador21@example.com", role="comprador"
    )
    await _bid(client, comprador_token, remate_id, lote_id, "1000.00")

    response = await client.get(_ofertas_url(remate_id, lote_id), headers=_auth(comprador_token))
    assert response.status_code == 403


async def test_non_owner_rematador_cannot_list_history(client: AsyncClient) -> None:
    _owner_token, remate_id, lote_id = await _setup_open_lote(client, "rematador22@example.com")
    other_rematador = await _register_and_login(
        client, email="rematador22b@example.com", role="empresa"
    )

    response = await client.get(_ofertas_url(remate_id, lote_id), headers=_auth(other_rematador))
    assert response.status_code == 403


async def test_same_client_token_reused_across_different_lotes_does_not_cross_contaminate(
    client: AsyncClient,
) -> None:
    """Fase 9 -- ADR-020 sección D pensó `client_token` para reintentar la MISMA oferta
    (mismo lote), no como un identificador de sesión reutilizable entre lotes distintos.
    Si un cliente (una request armada a mano, o un bug de un cliente HTTP no oficial)
    reutiliza el mismo `client_token` para ofertar en un lote B habiendo ya ofertado en
    un lote A con ese token, el servidor NO debe devolver silenciosamente la oferta de
    A como si fuera el resultado de ofertar en B -- eso dejaría al comprador creyendo
    que ofertó en B cuando en realidad no se registró ninguna oferta ahí."""
    owner_token = await _register_and_login(
        client, email="rematador-crosslote@example.com", role="empresa"
    )
    remate = await _create_remate(client, owner_token)
    remate_id = remate["id"]
    lote_a = await _create_lote(client, owner_token, remate_id, lot_number="1")
    lote_b = await _create_lote(
        client, owner_token, remate_id, lot_number="2", title="Vaquillona"
    )
    lote_a_id = lote_a["id"]
    lote_b_id = lote_b["id"]
    await client.post(f"{REMATES_URL}/{remate_id}/schedule", headers=_auth(owner_token))
    await client.post(f"{REMATES_URL}/{remate_id}/start", headers=_auth(owner_token))
    await client.post(f"{_lotes_url(remate_id)}/{lote_a_id}/open", headers=_auth(owner_token))

    comprador_token = await _register_and_login(
        client, email="comprador-crosslote@example.com", role="comprador"
    )

    first = await _bid(
        client, comprador_token, remate_id, lote_a_id, "1000.00", client_token="shared-token"
    )
    assert first.status_code == 201
    assert first.json()["lote_id"] == lote_a_id

    close_a = await client.post(
        f"{_lotes_url(remate_id)}/{lote_a_id}/close",
        json={"outcome": "sold", "final_price": "1000.00"},
        headers=_auth(owner_token),
    )
    assert close_a.status_code == 200, close_a.text
    open_b = await client.post(
        f"{_lotes_url(remate_id)}/{lote_b_id}/open", headers=_auth(owner_token)
    )
    assert open_b.status_code == 200, open_b.text

    second = await _bid(
        client, comprador_token, remate_id, lote_b_id, "1000.00", client_token="shared-token"
    )
    # Nunca 201 con la oferta ajena de lote_a disfrazada de resultado en lote_b -- o se
    # crea una oferta genuina en lote_b (201, id distinto), o se rechaza con un error
    # claro de conflicto (409), nunca una respuesta silenciosamente incorrecta.
    if second.status_code == 201:
        assert second.json()["lote_id"] == lote_b_id
        assert second.json()["id"] != first.json()["id"]
    else:
        assert second.status_code == 409, second.text
