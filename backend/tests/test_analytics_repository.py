"""Tests de `AnalyticsRepository` (Épica 7, Módulo 7.1), directos contra Postgres real
(sin mocks, mismo criterio que el resto de la suite -- ver docstring de
`tests/conftest.py`). El estado de dominio se arma vía HTTP (mismos helpers que
`test_snapshot_service.py`), y algunos timestamps se ajustan directamente en la base
para tests deterministas de duración/ventanas de tiempo, sin depender de `asyncio.sleep`.

El caso más importante de este archivo es el aislamiento cross-remate: una fuga de
`remate_id` en el `JOIN Oferta -> Lote` filtraría datos de negocio de otro rematador.
"""

import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from app.analytics.repository import AnalyticsRepository
from app.modules.ofertas.models import Oferta, OfertaStatus
from app.modules.remates.lotes.models import Lote
from app.modules.users.models import UserRole
from tests._role_test_helpers import activate_pending_account

REGISTER_URL = "/api/v1/auth/register"
LOGIN_URL = "/api/v1/auth/login"
REMATES_URL = "/api/v1/remates"


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
    if role in ("empresa", "rematador"):
        await activate_pending_account(email)
    login = await client.post(LOGIN_URL, data={"username": email, "password": "password123"})
    assert login.status_code == 200, login.text
    return register.json()["id"], login.json()["access_token"]


async def _owner(client: AsyncClient, email: str) -> tuple[str, str]:
    return await _register_and_login(client, email=email, role="empresa")


async def _buyer(client: AsyncClient, email: str) -> tuple[str, str]:
    return await _register_and_login(client, email=email, role="comprador")


async def _create_remate(client: AsyncClient, token: str, **overrides) -> dict:
    payload = {
        "title": "Remate de verificación de analítica",
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


async def _start_remate(client: AsyncClient, token: str, remate_id: str) -> None:
    r = await client.post(f"{REMATES_URL}/{remate_id}/schedule", headers=_auth(token))
    assert r.status_code == 200, r.text
    r = await client.post(f"{REMATES_URL}/{remate_id}/start", headers=_auth(token))
    assert r.status_code == 200, r.text


async def _open_lote(client: AsyncClient, token: str, remate_id: str, lote_id: str) -> dict:
    r = await client.post(f"{REMATES_URL}/{remate_id}/lotes/{lote_id}/open", headers=_auth(token))
    assert r.status_code == 200, r.text
    return r.json()


async def _close_lote(
    client: AsyncClient,
    token: str,
    remate_id: str,
    lote_id: str,
    *,
    outcome: str = "unsold",
    final_price: str | None = None,
) -> None:
    payload: dict = {"outcome": outcome}
    if final_price is not None:
        payload["final_price"] = final_price
    r = await client.post(
        f"{REMATES_URL}/{remate_id}/lotes/{lote_id}/close", json=payload, headers=_auth(token)
    )
    assert r.status_code == 200, r.text


async def _bid(client: AsyncClient, token: str, remate_id: str, lote_id: str, amount: str) -> dict:
    r = await client.post(
        f"{REMATES_URL}/{remate_id}/lotes/{lote_id}/ofertas",
        json={"amount": amount},
        headers=_auth(token),
    )
    assert r.status_code == 201, r.text
    return r.json()


# --- Agregados de lotes (vendidos/no vendidos/restantes/cancelados, duración, valor) ------


async def test_get_lote_status_aggregates_counts_each_status_avg_duration_and_value(
    client: AsyncClient, db_session: AsyncSession, db_engine: AsyncEngine
) -> None:
    _, owner_token = await _owner(client, "an-repo1@example.com")
    remate = await _create_remate(client, owner_token)
    lote_sold = await _create_lote(client, owner_token, remate["id"], lot_number="1")
    lote_unsold = await _create_lote(client, owner_token, remate["id"], lot_number="2")
    await _create_lote(client, owner_token, remate["id"], lot_number="3")  # queda pending
    await _start_remate(client, owner_token, remate["id"])

    await _open_lote(client, owner_token, remate["id"], lote_sold["id"])
    await _close_lote(
        client, owner_token, remate["id"], lote_sold["id"], outcome="sold", final_price="5000.00"
    )
    await _open_lote(client, owner_token, remate["id"], lote_unsold["id"])
    await _close_lote(client, owner_token, remate["id"], lote_unsold["id"], outcome="unsold")

    # Ajuste directo de opened_at/closed_at -- duración determinista, sin depender de
    # timing real (asyncio.sleep sería más lento y más frágil).
    sold_row = await db_session.get(Lote, lote_sold["id"])
    sold_row.opened_at = datetime.now(UTC) - timedelta(seconds=200)
    sold_row.closed_at = datetime.now(UTC) - timedelta(seconds=100)
    unsold_row = await db_session.get(Lote, lote_unsold["id"])
    unsold_row.opened_at = datetime.now(UTC) - timedelta(seconds=60)
    unsold_row.closed_at = datetime.now(UTC)
    await db_session.commit()

    repo = AnalyticsRepository(db_session)
    row = await repo.get_lote_status_aggregates(uuid.UUID(remate["id"]))

    assert row.pending == 1
    assert row.open == 0
    assert row.closed_sold == 1
    assert row.closed_unsold == 1
    assert row.cancelled == 0
    assert row.total == 3
    # (100 + 60) / 2 = 80s -- margen amplio por la resolución de los timestamps ajustados.
    assert abs(float(row.average_duration_seconds) - 80.0) < 2.0
    assert row.total_awarded_value == Decimal("5000.00")


async def test_get_lote_status_aggregates_with_no_lotes_returns_zero_value_and_null_duration(
    client: AsyncClient, db_session: AsyncSession, db_engine: AsyncEngine
) -> None:
    _, owner_token = await _owner(client, "an-repo2@example.com")
    remate = await _create_remate(client, owner_token)

    repo = AnalyticsRepository(db_session)
    row = await repo.get_lote_status_aggregates(uuid.UUID(remate["id"]))

    assert row.total == 0
    assert row.average_duration_seconds is None
    assert row.total_awarded_value == 0


# --- Conteo y ventana de tiempo de ofertas -------------------------------------------------


async def test_count_ofertas_since_is_inclusive_at_the_boundary(
    client: AsyncClient, db_session: AsyncSession, db_engine: AsyncEngine
) -> None:
    _, owner_token = await _owner(client, "an-repo3@example.com")
    _, buyer_token = await _buyer(client, "an-repo3-buyer@example.com")
    remate = await _create_remate(client, owner_token)
    lote = await _create_lote(client, owner_token, remate["id"])
    await _start_remate(client, owner_token, remate["id"])
    await _open_lote(client, owner_token, remate["id"], lote["id"])
    oferta = await _bid(client, buyer_token, remate["id"], lote["id"], "1000.00")

    oferta_row = await db_session.get(Oferta, oferta["id"])
    boundary = datetime.now(UTC)
    oferta_row.created_at = boundary
    await db_session.commit()

    repo = AnalyticsRepository(db_session)
    count = await repo.count_ofertas_since(uuid.UUID(remate["id"]), boundary)
    assert count == 1


async def test_get_bids_timeline_excludes_ofertas_older_than_the_window(
    client: AsyncClient, db_session: AsyncSession, db_engine: AsyncEngine
) -> None:
    _, owner_token = await _owner(client, "an-repo4@example.com")
    _, buyer_token = await _buyer(client, "an-repo4-buyer@example.com")
    remate = await _create_remate(client, owner_token)
    lote = await _create_lote(client, owner_token, remate["id"])
    await _start_remate(client, owner_token, remate["id"])
    await _open_lote(client, owner_token, remate["id"], lote["id"])

    old_oferta = await _bid(client, buyer_token, remate["id"], lote["id"], "1000.00")
    old_row = await db_session.get(Oferta, old_oferta["id"])
    old_row.created_at = datetime.now(UTC) - timedelta(hours=1)
    await db_session.commit()

    await _bid(client, buyer_token, remate["id"], lote["id"], "2000.00")

    repo = AnalyticsRepository(db_session)
    since = datetime.now(UTC) - timedelta(minutes=5)
    rows = await repo.get_bids_timeline(uuid.UUID(remate["id"]), since)

    assert len(rows) == 1
    assert rows[0].count == 1


# --- Oferta más alta / lote con más ofertas -------------------------------------------------


async def test_get_highest_oferta_excludes_rejected_bids(
    client: AsyncClient, db_session: AsyncSession, db_engine: AsyncEngine
) -> None:
    _, owner_token = await _owner(client, "an-repo5@example.com")
    _, buyer_token = await _buyer(client, "an-repo5-buyer@example.com")
    remate = await _create_remate(client, owner_token)
    lote = await _create_lote(client, owner_token, remate["id"])
    await _start_remate(client, owner_token, remate["id"])
    await _open_lote(client, owner_token, remate["id"], lote["id"])
    await _bid(client, buyer_token, remate["id"], lote["id"], "1000.00")
    rejected = await _bid(client, buyer_token, remate["id"], lote["id"], "1000.00")
    assert rejected["status"] == "rejected"

    repo = AnalyticsRepository(db_session)
    row = await repo.get_highest_oferta(uuid.UUID(remate["id"]))

    assert row is not None
    assert row.amount == Decimal("1000.00")
    assert row.status == OfertaStatus.ACCEPTED


async def test_get_highest_oferta_and_top_lote_return_none_without_offers(
    client: AsyncClient, db_session: AsyncSession, db_engine: AsyncEngine
) -> None:
    _, owner_token = await _owner(client, "an-repo6@example.com")
    remate = await _create_remate(client, owner_token)

    repo = AnalyticsRepository(db_session)
    assert await repo.get_highest_oferta(uuid.UUID(remate["id"])) is None
    assert await repo.get_top_lote_by_offer_count(uuid.UUID(remate["id"])) is None


# --- Línea de tiempo de eventos (lotes con opened_at/closed_at) ---------------------------


async def test_list_lote_transitions_includes_only_lotes_with_a_timestamp(
    client: AsyncClient, db_session: AsyncSession, db_engine: AsyncEngine
) -> None:
    _, owner_token = await _owner(client, "an-repo7@example.com")
    remate = await _create_remate(client, owner_token)
    lote_open = await _create_lote(client, owner_token, remate["id"], lot_number="1")
    await _create_lote(client, owner_token, remate["id"], lot_number="2")  # nunca se abre
    await _start_remate(client, owner_token, remate["id"])
    await _open_lote(client, owner_token, remate["id"], lote_open["id"])

    repo = AnalyticsRepository(db_session)
    lotes = await repo.list_lote_transitions(uuid.UUID(remate["id"]), limit=10)

    assert {str(lote.id) for lote in lotes} == {lote_open["id"]}


# --- Aislamiento cross-remate (el caso más importante de este archivo) --------------------


async def test_every_aggregate_is_scoped_to_the_correct_remate(
    client: AsyncClient, db_session: AsyncSession, db_engine: AsyncEngine
) -> None:
    _, owner_token = await _owner(client, "an-repo-iso@example.com")
    _, buyer_token = await _buyer(client, "an-repo-iso-buyer@example.com")

    remate_a = await _create_remate(client, owner_token, title="Remate A")
    remate_b = await _create_remate(client, owner_token, title="Remate B")
    lote_a = await _create_lote(client, owner_token, remate_a["id"])
    lote_b = await _create_lote(client, owner_token, remate_b["id"])
    await _start_remate(client, owner_token, remate_a["id"])
    await _start_remate(client, owner_token, remate_b["id"])
    await _open_lote(client, owner_token, remate_a["id"], lote_a["id"])
    await _open_lote(client, owner_token, remate_b["id"], lote_b["id"])
    await _bid(client, buyer_token, remate_a["id"], lote_a["id"], "1000.00")
    await _bid(client, buyer_token, remate_a["id"], lote_a["id"], "2000.00")
    await _bid(client, buyer_token, remate_b["id"], lote_b["id"], "1000.00")

    repo = AnalyticsRepository(db_session)

    assert await repo.count_total_ofertas(uuid.UUID(remate_a["id"])) == 2
    assert await repo.count_total_ofertas(uuid.UUID(remate_b["id"])) == 1

    highest_a = await repo.get_highest_oferta(uuid.UUID(remate_a["id"]))
    assert highest_a is not None
    assert highest_a.amount == Decimal("2000.00")
    assert str(highest_a.lote_id) == lote_a["id"]

    top_lote_a = await repo.get_top_lote_by_offer_count(uuid.UUID(remate_a["id"]))
    assert top_lote_a is not None
    assert str(top_lote_a.lote_id) == lote_a["id"]
    assert top_lote_a.offer_count == 2

    agg_a = await repo.get_lote_status_aggregates(uuid.UUID(remate_a["id"]))
    agg_b = await repo.get_lote_status_aggregates(uuid.UUID(remate_b["id"]))
    assert agg_a.total == 1
    assert agg_b.total == 1

    transitions_a = await repo.list_lote_transitions(uuid.UUID(remate_a["id"]), limit=10)
    assert {str(lote.id) for lote in transitions_a} == {lote_a["id"]}


# --- Resolución de roles ---------------------------------------------------------------------


async def test_get_roles_by_ids_resolves_mixed_roles(
    client: AsyncClient, db_session: AsyncSession, db_engine: AsyncEngine
) -> None:
    owner_id, _ = await _owner(client, "an-repo-roles-owner@example.com")
    buyer_id, _ = await _buyer(client, "an-repo-roles-buyer@example.com")

    repo = AnalyticsRepository(db_session)
    roles = await repo.get_roles_by_ids({uuid.UUID(owner_id), uuid.UUID(buyer_id)})

    assert roles[uuid.UUID(owner_id)] == UserRole.EMPRESA
    assert roles[uuid.UUID(buyer_id)] == UserRole.COMPRADOR


async def test_get_roles_by_ids_with_empty_set_returns_empty_dict(
    db_session: AsyncSession,
) -> None:
    repo = AnalyticsRepository(db_session)
    assert await repo.get_roles_by_ids(set()) == {}
