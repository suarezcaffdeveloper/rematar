"""Tests de Fase 9 (WebSocket Security Audit -- Auction Business Logic Security /
Offer & Adjudication Audit): race conditions sobre el cierre manual de un lote.

`AuctionEngine.place_bid` y `TimerExpiryScheduler`/`LoteService.auto_close` ya
serializan correctamente contra concurrencia real (`SELECT ... FOR UPDATE`, ADR-004),
con tests dedicados (`test_auction_engine.py::test_two_concurrent_bids_are_serialized_by_the_row_lock`,
`test_lote_timer.py::test_concurrent_bid_and_scheduler_never_leave_an_inconsistent_state`).
El cierre MANUAL (`POST .../close`, `LoteService.close`/`cancel`/`open`/`requeue`, vía
`_get_owned_lote_or_raise`) leía el lote con un `SELECT` simple (sin lock) -- este
archivo demuestra las dos consecuencias reales de esa asimetría y las deja como
regresión:

1. Dos llamadas a `close()` concurrentes sobre el mismo lote (doble adjudicación / doble
   cierre -- ej. un doble click, o un reintento de red del propio rematador) podían
   completar **las dos** con éxito, con la segunda pisando en silencio el resultado
   (`final_price`/`outcome`) de la primera -- sin ningún error, sin ningún indicio de
   conflicto. `LoteStatus.CLOSED_SOLD` no tiene transiciones salientes
   (`lotes/state_machine.py`): el estado final debía ser "la primera decisión gana, la
   segunda se rechaza", no "gana quien commitee último".
2. Una oferta podía quedar `ACCEPTED` sobre un lote que, en términos de negocio, ya
   había sido cerrado por el rematador -- inconsistente con la garantía que sí existe
   para el cierre automático por timer.
"""

import asyncio
from decimal import Decimal

from httpx import AsyncClient

REGISTER_URL = "/api/v1/auth/register"
LOGIN_URL = "/api/v1/auth/login"
REMATES_URL = "/api/v1/remates"


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


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
    login = await client.post(LOGIN_URL, data={"username": email, "password": "password123"})
    assert login.status_code == 200, login.text
    return login.json()["access_token"]


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


async def _setup_open_lote(client: AsyncClient, owner_email: str) -> tuple[str, str, str]:
    owner_token = await _register_and_login(client, email=owner_email, role="rematador")
    remate = await _create_remate(client, owner_token)
    lote = await _create_lote(client, owner_token, remate["id"])
    await client.post(f"{REMATES_URL}/{remate['id']}/schedule", headers=_auth(owner_token))
    await client.post(f"{REMATES_URL}/{remate['id']}/start", headers=_auth(owner_token))
    open_response = await client.post(
        f"{_lotes_url(remate['id'])}/{lote['id']}/open", headers=_auth(owner_token)
    )
    assert open_response.status_code == 200, open_response.text
    return owner_token, remate["id"], lote["id"]


async def _close(
    client: AsyncClient, token: str, remate_id: str, lote_id: str, *, outcome: str, final_price: str | None
):
    payload: dict = {"outcome": outcome}
    if final_price is not None:
        payload["final_price"] = final_price
    return await client.post(
        f"{_lotes_url(remate_id)}/{lote_id}/close", json=payload, headers=_auth(token)
    )


async def _bid(client: AsyncClient, token: str, remate_id: str, lote_id: str, amount: str):
    return await client.post(
        _ofertas_url(remate_id, lote_id), json={"amount": amount}, headers=_auth(token)
    )


# --- Test F: dos adjudicaciones (cierres) concurrentes sobre el mismo lote -------------


async def test_two_concurrent_manual_closes_only_one_succeeds(client: AsyncClient) -> None:
    """Ataque: el rematador (o un cliente HTTP con un reintento de red) manda DOS
    `POST .../close` casi simultáneos con resultados DISTINTOS -- uno declara `sold` a
    $1200, el otro `unsold`. Exactamente uno debe tener éxito; el otro debe ser
    rechazado con un error de transición de estado (la segunda llamada ve el lote ya
    `closed_sold`/`closed_unsold`, no `open`) -- nunca los dos 200, y nunca el estado
    final determinado por "quien commiteó último" sin que quede registro del conflicto."""
    owner_token, remate_id, lote_id = await _setup_open_lote(client, "closer1@example.com")

    response_sold, response_unsold = await asyncio.gather(
        _close(client, owner_token, remate_id, lote_id, outcome="sold", final_price="1200.00"),
        _close(client, owner_token, remate_id, lote_id, outcome="unsold", final_price=None),
    )

    statuses = sorted([response_sold.status_code, response_unsold.status_code])
    assert statuses == [200, 422], (
        f"se esperaba exactamente un 200 (ALLOW) y un 422 (DENY, transición inválida "
        f"sobre un lote ya cerrado) -- se obtuvo {response_sold.status_code} y "
        f"{response_unsold.status_code}"
    )

    lote_response = await client.get(
        f"{_lotes_url(remate_id)}/{lote_id}", headers=_auth(owner_token)
    )
    assert lote_response.status_code == 200
    lote = lote_response.json()
    assert lote["status"] in ("closed_sold", "closed_unsold")

    # El estado final debe coincidir EXACTAMENTE con el request que efectivamente ganó
    # (200), nunca una mezcla (ej. status "unsold" pero con el final_price de la otra
    # llamada, o viceversa).
    if response_sold.status_code == 200:
        assert lote["status"] == "closed_sold"
        assert Decimal(str(lote["final_price"])) == Decimal("1200.00")
    else:
        assert lote["status"] == "closed_unsold"
        assert lote["final_price"] is None


async def test_two_concurrent_cancels_only_one_succeeds(client: AsyncClient) -> None:
    """Mismo ataque que arriba, contra `cancel` -- otra transición terminal
    (`OPEN -> CANCELLED`) que debería ser exactamente una vez."""
    owner_token, remate_id, lote_id = await _setup_open_lote(client, "canceler1@example.com")

    async def _cancel():
        return await client.post(
            f"{_lotes_url(remate_id)}/{lote_id}/cancel",
            json={"reason": "concurrencia de prueba"},
            headers=_auth(owner_token),
        )

    response_a, response_b = await asyncio.gather(_cancel(), _cancel())

    statuses = sorted([response_a.status_code, response_b.status_code])
    assert statuses == [200, 422], (
        f"se esperaba exactamente un 200 y un 422 -- se obtuvo {response_a.status_code} "
        f"y {response_b.status_code}"
    )


# --- Test D: oferta simultánea con cierre manual del lote -------------------------------


async def test_bid_concurrent_with_manual_close_is_serialized_and_leaves_a_consistent_state(
    client: AsyncClient,
) -> None:
    """`place_bid` y el cierre manual ahora compiten por el mismo lock de fila
    (ADR-004) -- cualquiera que gane, la otra ve el estado YA actualizado al
    desbloquearse, nunca una lectura vieja.

    OJO -- esto NO garantiza "nunca una oferta accepted sobre un lote cerrado": por
    diseño (ADR-018, "Cierre de lote sin motor de ofertas"), el cierre MANUAL es una
    declaración independiente del rematador, nunca reconciliada contra la oferta
    vigente (a diferencia de `auto_close`, que sí la usa) -- si la oferta gana la
    carrera del lock y se acepta ANTES de que el cierre adquiera el lock, el cierre
    manual puede declarar `unsold` (o `sold` a otro precio) igual, sin error: es una
    ambigüedad de negocio ya documentada y aceptada en ADR-018, no un bug de
    concurrencia. Lo que este test verifica es lo que el lock sí garantiza: ninguna de
    las dos operaciones falla de forma inesperada, y el estado final (oferta + lote) es
    siempre autoconsistente con el resultado que cada respuesta reportó -- nunca una
    oferta fantasma ni un cierre a medio aplicar."""
    owner_token, remate_id, lote_id = await _setup_open_lote(client, "closer2@example.com")
    buyer_token = await _register_and_login(
        client, email="closer2-buyer@example.com", role="comprador"
    )

    bid_response, close_response = await asyncio.gather(
        _bid(client, buyer_token, remate_id, lote_id, "1000.00"),
        _close(client, owner_token, remate_id, lote_id, outcome="unsold", final_price=None),
    )

    assert close_response.status_code == 200, close_response.text
    assert bid_response.status_code == 201, bid_response.text

    lote_response = await client.get(
        f"{_lotes_url(remate_id)}/{lote_id}", headers=_auth(owner_token)
    )
    lote = lote_response.json()
    assert lote["status"] == "closed_unsold"

    bid_status = bid_response.json()["status"]
    history = await client.get(_ofertas_url(remate_id, lote_id), headers=_auth(owner_token))
    persisted_status = history.json()["items"][0]["status"]
    # La oferta persistida siempre coincide con lo que la propia respuesta ya había
    # reportado -- ninguna de las dos transacciones "ganó" a medias.
    assert persisted_status == bid_status
    assert bid_status in ("accepted", "rejected")
