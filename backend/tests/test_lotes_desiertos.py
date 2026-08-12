"""Tests del módulo de lotes desiertos: reincorporación a la cola.

Cubren: conservación de datos del lote al quedar desierto y al reincorporarse,
posición al final de la cola actual, orden de reincorporación de varios lotes,
condiciones comerciales editables en la nueva ronda, historial de rondas archivadas
(`LoteRound`), permisos/autorización, auditoría (`lote.requeued`) y que un lote
reincorporado pueda venderse en su nueva ronda. La no-autofinalización del remate y la
finalización manual ya se cubren en `test_state_engine.py` -- acá solo lo mínimo
necesario para los flujos propios de este módulo (cerrar el último lote no debe impedir
seguir operando sobre los lotes desiertos).
"""

from decimal import Decimal

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker

from app.audit.models import AuditLogEntry

REGISTER_URL = "/api/v1/auth/register"
LOGIN_URL = "/api/v1/auth/login"
REMATES_URL = "/api/v1/remates"


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


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
        "images": [{"url": "https://example.com/toro.jpg", "order": 0, "caption": None}],
    }
    payload.update(overrides)
    response = await client.post(_lotes_url(remate_id), json=payload, headers=_auth(token))
    assert response.status_code == 201, response.text
    return response.json()


async def _schedule(client: AsyncClient, token: str, remate_id: str) -> None:
    r = await client.post(f"{REMATES_URL}/{remate_id}/schedule", headers=_auth(token))
    assert r.status_code == 200, r.text


async def _start(client: AsyncClient, token: str, remate_id: str) -> None:
    r = await client.post(f"{REMATES_URL}/{remate_id}/start", headers=_auth(token))
    assert r.status_code == 200, r.text


async def _open_lote(client: AsyncClient, token: str, remate_id: str, lote_id: str) -> None:
    r = await client.post(f"{_lotes_url(remate_id)}/{lote_id}/open", headers=_auth(token))
    assert r.status_code == 200, r.text


async def _close_lote(
    client: AsyncClient,
    token: str,
    remate_id: str,
    lote_id: str,
    *,
    outcome: str = "unsold",
    final_price: str | None = None,
) -> dict:
    payload: dict = {"outcome": outcome}
    if final_price is not None:
        payload["final_price"] = final_price
    r = await client.post(
        f"{_lotes_url(remate_id)}/{lote_id}/close", json=payload, headers=_auth(token)
    )
    assert r.status_code == 200, r.text
    return r.json()


async def _get_lote(client: AsyncClient, token: str, remate_id: str, lote_id: str) -> dict:
    r = await client.get(f"{_lotes_url(remate_id)}/{lote_id}", headers=_auth(token))
    assert r.status_code == 200, r.text
    return r.json()


async def _list_lotes(client: AsyncClient, token: str, remate_id: str) -> list[dict]:
    r = await client.get(_lotes_url(remate_id), params={"page_size": 100}, headers=_auth(token))
    assert r.status_code == 200, r.text
    return r.json()["items"]


async def _requeue(
    client: AsyncClient, token: str, remate_id: str, lote_id: str, **overrides
) -> AsyncClient:
    return await client.post(
        f"{_lotes_url(remate_id)}/{lote_id}/requeue", json=overrides, headers=_auth(token)
    )


async def _setup_desierto_lote(
    client: AsyncClient, email: str, **lote_overrides
) -> tuple[str, str, str]:
    """Rematador con un remate LIVE y un único lote `closed_unsold`. Devuelve (token,
    remate_id, lote_id)."""
    token = await _register_and_login(client, email=email, role="rematador")
    remate = await _create_remate(client, token)
    lote = await _create_lote(client, token, remate["id"], **lote_overrides)
    await _schedule(client, token, remate["id"])
    await _start(client, token, remate["id"])
    await _open_lote(client, token, remate["id"], lote["id"])
    await _close_lote(client, token, remate["id"], lote["id"], outcome="unsold")
    return token, remate["id"], lote["id"]


# --- Conservación de datos y transición de estado --------------------------------------


async def test_requeue_moves_desierto_lote_back_to_pending(client: AsyncClient) -> None:
    token, remate_id, lote_id = await _setup_desierto_lote(client, "rem-desierto1@example.com")

    response = await _requeue(client, token, remate_id, lote_id)
    assert response.status_code == 200, response.text
    lote = response.json()

    assert lote["status"] == "pending"
    assert lote["final_price"] is None
    assert lote["round_number"] == 2


async def test_requeue_preserves_lot_number_title_and_images(client: AsyncClient) -> None:
    token, remate_id, lote_id = await _setup_desierto_lote(
        client, "rem-desierto2@example.com", lot_number="7", title="Sembradora Apache"
    )

    response = await _requeue(client, token, remate_id, lote_id)
    assert response.status_code == 200, response.text
    lote = response.json()

    assert lote["lot_number"] == "7"
    assert lote["title"] == "Sembradora Apache"
    assert lote["images"] == [{"url": "https://example.com/toro.jpg", "order": 0, "caption": None}]


async def test_requeue_rejects_lote_that_is_not_closed_unsold(client: AsyncClient) -> None:
    token = await _register_and_login(client, email="rem-desierto3@example.com", role="rematador")
    remate = await _create_remate(client, token)
    lote = await _create_lote(client, token, remate["id"])
    await _schedule(client, token, remate["id"])
    await _start(client, token, remate["id"])
    # Todavía PENDING, nunca se cerró.

    response = await _requeue(client, token, remate["id"], lote["id"])
    assert response.status_code == 422


async def test_requeue_rejects_closed_sold_lote(client: AsyncClient) -> None:
    token = await _register_and_login(client, email="rem-desierto4@example.com", role="rematador")
    remate = await _create_remate(client, token)
    lote = await _create_lote(client, token, remate["id"])
    await _schedule(client, token, remate["id"])
    await _start(client, token, remate["id"])
    await _open_lote(client, token, remate["id"], lote["id"])
    await _close_lote(client, token, remate["id"], lote["id"], outcome="sold", final_price="1500.00")

    response = await _requeue(client, token, remate["id"], lote["id"])
    assert response.status_code == 422


async def test_requeue_requires_remate_live_or_paused(client: AsyncClient) -> None:
    token, remate_id, lote_id = await _setup_desierto_lote(client, "rem-desierto5@example.com")
    finish = await client.post(f"{REMATES_URL}/{remate_id}/finish", headers=_auth(token))
    assert finish.status_code == 200

    response = await _requeue(client, token, remate_id, lote_id)
    assert response.status_code == 422


# --- Posición en la cola -----------------------------------------------------------------


async def test_requeue_places_lote_at_end_of_current_queue(client: AsyncClient) -> None:
    token = await _register_and_login(client, email="rem-desierto6@example.com", role="rematador")
    remate = await _create_remate(client, token)
    lote1 = await _create_lote(client, token, remate["id"], lot_number="1")
    lote2 = await _create_lote(client, token, remate["id"], lot_number="2")
    lote3 = await _create_lote(client, token, remate["id"], lot_number="3")
    lote4 = await _create_lote(client, token, remate["id"], lot_number="4")
    await _schedule(client, token, remate["id"])
    await _start(client, token, remate["id"])

    await _open_lote(client, token, remate["id"], lote1["id"])
    await _close_lote(client, token, remate["id"], lote1["id"], outcome="sold", final_price="1200.00")
    await _open_lote(client, token, remate["id"], lote2["id"])
    await _close_lote(client, token, remate["id"], lote2["id"], outcome="unsold")

    await _requeue(client, token, remate["id"], lote2["id"])

    lotes = await _list_lotes(client, token, remate["id"])
    pending_in_order = [lote["lot_number"] for lote in sorted(lotes, key=lambda item: item["display_order"]) if lote["status"] == "pending"]
    assert pending_in_order == ["3", "4", "2"]


async def test_requeue_multiple_desierto_lotes_preserves_reincorporation_order(
    client: AsyncClient,
) -> None:
    token = await _register_and_login(client, email="rem-desierto7@example.com", role="rematador")
    remate = await _create_remate(client, token)
    lote_numbers = {n: await _create_lote(client, token, remate["id"], lot_number=n) for n in ["2", "4", "5", "6", "7", "8"]}
    await _schedule(client, token, remate["id"])
    await _start(client, token, remate["id"])

    for n in ["2", "4", "5"]:
        await _open_lote(client, token, remate["id"], lote_numbers[n]["id"])
        await _close_lote(client, token, remate["id"], lote_numbers[n]["id"], outcome="unsold")

    # Reincorporados en este orden, no el de creación ni el numérico.
    for n in ["2", "4", "5"]:
        response = await _requeue(client, token, remate["id"], lote_numbers[n]["id"])
        assert response.status_code == 200, response.text

    lotes = await _list_lotes(client, token, remate["id"])
    pending_in_order = [lote["lot_number"] for lote in sorted(lotes, key=lambda item: item["display_order"]) if lote["status"] == "pending"]
    assert pending_in_order == ["6", "7", "8", "2", "4", "5"]


# --- Condiciones comerciales de la nueva ronda -------------------------------------------


async def test_requeue_keeps_previous_conditions_when_none_provided(client: AsyncClient) -> None:
    token, remate_id, lote_id = await _setup_desierto_lote(client, "rem-desierto8@example.com")

    response = await _requeue(client, token, remate_id, lote_id)
    lote = response.json()
    assert Decimal(lote["base_price"]) == Decimal("1000.00")
    assert Decimal(lote["min_increment"]) == Decimal("100.00")


async def test_requeue_allows_editing_commercial_conditions(client: AsyncClient) -> None:
    token, remate_id, lote_id = await _setup_desierto_lote(client, "rem-desierto9@example.com")

    response = await _requeue(
        client,
        token,
        remate_id,
        lote_id,
        base_price="800.00",
        min_increment="50.00",
        reserve_price="900.00",
    )
    assert response.status_code == 200, response.text
    lote = response.json()
    assert Decimal(lote["base_price"]) == Decimal("800.00")
    assert Decimal(lote["min_increment"]) == Decimal("50.00")
    assert Decimal(lote["reserve_price"]) == Decimal("900.00")


async def test_requeue_rejects_reserve_price_below_new_base_price(client: AsyncClient) -> None:
    token, remate_id, lote_id = await _setup_desierto_lote(client, "rem-desierto10@example.com")

    response = await _requeue(
        client, token, remate_id, lote_id, base_price="800.00", reserve_price="500.00"
    )
    assert response.status_code == 422


# --- Historial de rondas (LoteRound) -------------------------------------------------------


async def test_rounds_endpoint_archives_previous_round_after_requeue(client: AsyncClient) -> None:
    token, remate_id, lote_id = await _setup_desierto_lote(client, "rem-desierto11@example.com")

    await _requeue(client, token, remate_id, lote_id, base_price="900.00")

    r = await client.get(f"{_lotes_url(remate_id)}/{lote_id}/rounds", headers=_auth(token))
    assert r.status_code == 200, r.text
    rounds = r.json()
    assert len(rounds) == 1
    assert rounds[0]["round_number"] == 1
    assert Decimal(rounds[0]["base_price"]) == Decimal("1000.00")  # condición vigente en la ronda archivada
    assert rounds[0]["closed_at"] is not None
    assert rounds[0]["requeued_by_name"] is not None


async def test_rounds_endpoint_masks_reserve_price_for_non_owner(client: AsyncClient) -> None:
    token, remate_id, lote_id = await _setup_desierto_lote(
        client, "rem-desierto12@example.com", reserve_price="1100.00"
    )
    await _requeue(client, token, remate_id, lote_id)

    comprador_token = await _register_and_login(
        client, email="comprador-desierto1@example.com", role="comprador"
    )
    r = await client.get(
        f"{_lotes_url(remate_id)}/{lote_id}/rounds", headers=_auth(comprador_token)
    )
    assert r.status_code == 200, r.text
    assert r.json()[0]["reserve_price"] is None


# --- Permisos ------------------------------------------------------------------------------


async def test_requeue_forbidden_for_non_owner_rematador(client: AsyncClient) -> None:
    token, remate_id, lote_id = await _setup_desierto_lote(client, "rem-desierto13@example.com")
    other_token = await _register_and_login(
        client, email="rem-desierto13b@example.com", role="rematador"
    )

    response = await _requeue(client, other_token, remate_id, lote_id)
    assert response.status_code == 403


async def test_requeue_forbidden_for_comprador(client: AsyncClient) -> None:
    token, remate_id, lote_id = await _setup_desierto_lote(client, "rem-desierto14@example.com")
    comprador_token = await _register_and_login(
        client, email="comprador-desierto2@example.com", role="comprador"
    )

    response = await _requeue(client, comprador_token, remate_id, lote_id)
    assert response.status_code == 403


# --- Auditoría -----------------------------------------------------------------------------


async def test_requeue_records_audit_entry(client: AsyncClient, db_engine: AsyncEngine) -> None:
    token, remate_id, lote_id = await _setup_desierto_lote(client, "rem-desierto15@example.com")

    response = await _requeue(client, token, remate_id, lote_id, base_price="900.00")
    assert response.status_code == 200, response.text

    session_factory = async_sessionmaker(bind=db_engine, expire_on_commit=False)
    async with session_factory() as session:
        rows = (
            await session.execute(
                select(AuditLogEntry).where(AuditLogEntry.action == "lote.requeued")
            )
        ).scalars().all()

    assert len(rows) == 1
    entry = rows[0]
    assert entry.resource_type == "lote"
    assert str(entry.resource_id) == lote_id
    assert entry.details["previous_round"] == 1
    assert entry.details["new_round"] == 2
    assert entry.details["conditions_changed"] is True


# --- Flujo completo: nueva ronda vendida ----------------------------------------------------


async def test_requeued_lote_can_be_opened_and_sold_in_new_round(client: AsyncClient) -> None:
    token, remate_id, lote_id = await _setup_desierto_lote(client, "rem-desierto16@example.com")
    await _requeue(client, token, remate_id, lote_id)

    await _open_lote(client, token, remate_id, lote_id)
    closed = await _close_lote(
        client, token, remate_id, lote_id, outcome="sold", final_price="1300.00"
    )

    assert closed["status"] == "closed_sold"
    assert Decimal(closed["final_price"]) == Decimal("1300.00")
    assert closed["round_number"] == 2

    r = await client.get(f"{_lotes_url(remate_id)}/{lote_id}/rounds", headers=_auth(token))
    assert r.status_code == 200
    assert len(r.json()) == 1  # solo la ronda 1 (desierta) queda archivada


# --- Cerrar el último lote no bloquea seguir gestionando los desiertos ----------------------


async def test_closing_last_lote_as_unsold_keeps_remate_live_for_requeue_decision(
    client: AsyncClient,
) -> None:
    token, remate_id, lote_id = await _setup_desierto_lote(client, "rem-desierto17@example.com")

    remate = await client.get(f"{REMATES_URL}/{remate_id}", headers=_auth(token))
    assert remate.json()["status"] == "live"

    # El rematador puede seguir operando sobre el lote desierto (reincorporarlo) sin
    # haber tenido que finalizar el remate.
    response = await _requeue(client, token, remate_id, lote_id)
    assert response.status_code == 200
