"""Tests de `HistoryRepository` (Épica 7, Módulo 7.3), directos contra Postgres real
(sin mocks, mismo criterio que el resto de la suite -- ver docstring de
`tests/conftest.py`). El estado de dominio se arma vía HTTP, mismos helpers que
`test_analytics_repository.py`.
"""

import uuid
from datetime import UTC, datetime, timedelta

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.history.repository import HistoryRepository
from app.modules.remates.models import Remate

REGISTER_URL = "/api/v1/auth/register"
LOGIN_URL = "/api/v1/auth/login"
REMATES_URL = "/api/v1/remates"


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def _register_and_login(client: AsyncClient, *, email: str, role: str) -> tuple[str, str]:
    """Devuelve `(user_id, access_token)`."""
    payload = {"email": email, "password": "password123", "full_name": "Test", "role": role}
    register = await client.post(REGISTER_URL, json=payload)
    assert register.status_code == 201, register.text
    login = await client.post(LOGIN_URL, data={"username": email, "password": "password123"})
    assert login.status_code == 200, login.text
    return register.json()["id"], login.json()["access_token"]


async def _owner(client: AsyncClient, email: str) -> tuple[str, str]:
    return await _register_and_login(client, email=email, role="rematador")


async def _buyer(client: AsyncClient, email: str) -> tuple[str, str]:
    return await _register_and_login(client, email=email, role="comprador")


async def _create_remate(client: AsyncClient, token: str, **overrides) -> dict:
    payload = {
        "title": "Remate de verificación de historial",
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


async def _open_lote(client: AsyncClient, token: str, remate_id: str, lote_id: str) -> None:
    r = await client.post(f"{REMATES_URL}/{remate_id}/lotes/{lote_id}/open", headers=_auth(token))
    assert r.status_code == 200, r.text


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


async def _send_chat_message(client: AsyncClient, token: str, remate_id: str, content: str) -> dict:
    r = await client.post(
        f"{REMATES_URL}/{remate_id}/chat/messages", json={"content": content}, headers=_auth(token)
    )
    assert r.status_code == 201, r.text
    return r.json()


async def _finish_a_full_remate(
    client: AsyncClient, owner_token: str, buyer_token: str, *, title: str
) -> dict:
    """Un remate completo, FINISHED automáticamente (RF-10) al cerrarse su único lote:
    un lote vendido, con una oferta ganadora."""
    remate = await _create_remate(client, owner_token, title=title)
    lote = await _create_lote(client, owner_token, remate["id"])
    await _start_remate(client, owner_token, remate["id"])
    await _open_lote(client, owner_token, remate["id"], lote["id"])
    await _bid(client, buyer_token, remate["id"], lote["id"], "1000.00")
    await _close_lote(
        client, owner_token, remate["id"], lote["id"], outcome="sold", final_price="1200.00"
    )
    return remate


# --- list_finished_summaries -----------------------------------------------------------


async def test_list_finished_summaries_only_returns_terminal_states(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner_id, owner_token = await _owner(client, "hist-repo1@example.com")
    _, buyer_token = await _buyer(client, "hist-repo1-buyer@example.com")
    finished = await _finish_a_full_remate(client, owner_token, buyer_token, title="Finalizado 1")
    live_remate = await _create_remate(client, owner_token, title="En vivo, no debe salir")
    await _create_lote(client, owner_token, live_remate["id"])
    await _start_remate(client, owner_token, live_remate["id"])

    repo = HistoryRepository(db_session)
    rows, _ = await repo.list_finished_summaries(
        owner_id=uuid.UUID(owner_id),
        search=None,
        date_from=None,
        date_to=None,
        sort="date_desc",
        offset=0,
        limit=10,
    )
    ids = {str(row.id) for row in rows}
    assert finished["id"] in ids
    assert live_remate["id"] not in ids


async def test_list_finished_summaries_computes_correct_aggregates(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner_id, owner_token = await _owner(client, "hist-repo2@example.com")
    _, buyer1_token = await _buyer(client, "hist-repo2-buyer1@example.com")
    _, buyer2_token = await _buyer(client, "hist-repo2-buyer2@example.com")

    remate = await _create_remate(client, owner_token, title="Remate con dos lotes")
    lote_sold = await _create_lote(client, owner_token, remate["id"], lot_number="1")
    lote_unsold = await _create_lote(client, owner_token, remate["id"], lot_number="2")
    await _start_remate(client, owner_token, remate["id"])

    await _open_lote(client, owner_token, remate["id"], lote_sold["id"])
    await _bid(client, buyer1_token, remate["id"], lote_sold["id"], "1000.00")
    await _bid(client, buyer2_token, remate["id"], lote_sold["id"], "1100.00")
    await _close_lote(
        client, owner_token, remate["id"], lote_sold["id"], outcome="sold", final_price="1500.00"
    )

    await _open_lote(client, owner_token, remate["id"], lote_unsold["id"])
    await _close_lote(client, owner_token, remate["id"], lote_unsold["id"], outcome="unsold")

    repo = HistoryRepository(db_session)
    rows, total = await repo.list_finished_summaries(
        owner_id=uuid.UUID(owner_id),
        search="dos lotes",
        date_from=None,
        date_to=None,
        sort="date_desc",
        offset=0,
        limit=10,
    )
    assert total == 1
    row = rows[0]
    assert row.lote_count == 2
    assert row.lotes_sold_count == 1
    assert row.total_awarded_value == 1500
    assert row.buyer_count == 2  # dos compradores distintos ofertaron
    assert row.first_opened is not None
    assert row.last_closed is not None


async def test_list_finished_summaries_filters_by_owner_id(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner1_id, owner1_token = await _owner(client, "hist-repo3-a@example.com")
    _, owner2_token = await _owner(client, "hist-repo3-b@example.com")
    _, buyer_token = await _buyer(client, "hist-repo3-buyer@example.com")

    await _finish_a_full_remate(client, owner1_token, buyer_token, title="Del owner 1")
    await _finish_a_full_remate(client, owner2_token, buyer_token, title="Del owner 2")

    repo = HistoryRepository(db_session)
    rows, total = await repo.list_finished_summaries(
        owner_id=uuid.UUID(owner1_id),
        search=None,
        date_from=None,
        date_to=None,
        sort="date_desc",
        offset=0,
        limit=10,
    )
    assert total == 1
    assert rows[0].title == "Del owner 1"


async def test_list_finished_summaries_global_view_ignores_owner(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    _, owner1_token = await _owner(client, "hist-repo4-a@example.com")
    _, owner2_token = await _owner(client, "hist-repo4-b@example.com")
    _, buyer_token = await _buyer(client, "hist-repo4-buyer@example.com")

    await _finish_a_full_remate(client, owner1_token, buyer_token, title="Global A")
    await _finish_a_full_remate(client, owner2_token, buyer_token, title="Global B")

    repo = HistoryRepository(db_session)
    rows, total = await repo.list_finished_summaries(
        owner_id=None, search=None, date_from=None, date_to=None, sort="date_desc", offset=0, limit=10
    )
    titles = {row.title for row in rows}
    assert {"Global A", "Global B"}.issubset(titles)
    assert total >= 2


async def test_list_finished_summaries_filters_by_date_range(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner_id, owner_token = await _owner(client, "hist-repo5@example.com")
    _, buyer_token = await _buyer(client, "hist-repo5-buyer@example.com")
    remate = await _finish_a_full_remate(client, owner_token, buyer_token, title="Con fecha ajustada")

    remate_row = await db_session.get(Remate, remate["id"])
    remate_row.finished_at = datetime.now(UTC) - timedelta(days=10)
    await db_session.commit()

    repo = HistoryRepository(db_session)
    boundary = datetime.now(UTC) - timedelta(days=1)

    _, total_before = await repo.list_finished_summaries(
        owner_id=uuid.UUID(owner_id), search=None, date_from=None, date_to=boundary,
        sort="date_desc", offset=0, limit=10,
    )
    assert total_before == 1

    _, total_after = await repo.list_finished_summaries(
        owner_id=uuid.UUID(owner_id), search=None, date_from=boundary, date_to=None,
        sort="date_desc", offset=0, limit=10,
    )
    assert total_after == 0


async def test_list_finished_summaries_sorts_by_amount(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner_id, owner_token = await _owner(client, "hist-repo6@example.com")

    remate_low = await _create_remate(client, owner_token, title="Barato")
    lote_low = await _create_lote(
        client, owner_token, remate_low["id"], base_price="50.00", min_increment="10.00"
    )
    await _start_remate(client, owner_token, remate_low["id"])
    await _open_lote(client, owner_token, remate_low["id"], lote_low["id"])
    await _close_lote(
        client, owner_token, remate_low["id"], lote_low["id"], outcome="sold", final_price="100.00"
    )

    remate_high = await _create_remate(client, owner_token, title="Caro")
    lote_high = await _create_lote(client, owner_token, remate_high["id"])
    await _start_remate(client, owner_token, remate_high["id"])
    await _open_lote(client, owner_token, remate_high["id"], lote_high["id"])
    await _close_lote(
        client, owner_token, remate_high["id"], lote_high["id"], outcome="sold", final_price="9000.00"
    )

    repo = HistoryRepository(db_session)
    rows, _ = await repo.list_finished_summaries(
        owner_id=uuid.UUID(owner_id), search=None, date_from=None, date_to=None,
        sort="amount_desc", offset=0, limit=10,
    )
    assert rows[0].title == "Caro"
    assert rows[1].title == "Barato"


# --- get_remate_duration / get_chat_activity / get_distinct_participant_count -----------


async def test_get_remate_duration_uses_min_opened_max_closed(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    _, owner_token = await _owner(client, "hist-repo7@example.com")
    _, buyer_token = await _buyer(client, "hist-repo7-buyer@example.com")
    remate = await _finish_a_full_remate(client, owner_token, buyer_token, title="Con duración")

    repo = HistoryRepository(db_session)
    first_opened, last_closed = await repo.get_remate_duration(uuid.UUID(remate["id"]))
    assert first_opened is not None
    assert last_closed is not None
    assert last_closed >= first_opened


async def test_get_remate_duration_is_none_without_any_lote_activity(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    _, owner_token = await _owner(client, "hist-repo7b@example.com")
    remate = await _create_remate(client, owner_token, title="Sin actividad")

    repo = HistoryRepository(db_session)
    first_opened, last_closed = await repo.get_remate_duration(uuid.UUID(remate["id"]))
    assert first_opened is None
    assert last_closed is None


async def test_get_chat_activity_counts_messages_and_excludes_system(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    _, owner_token = await _owner(client, "hist-repo8@example.com")
    _, buyer_token = await _buyer(client, "hist-repo8-buyer@example.com")
    remate = await _create_remate(client, owner_token, title="Con chat")
    await _create_lote(client, owner_token, remate["id"])
    await _start_remate(client, owner_token, remate["id"])

    await _send_chat_message(client, buyer_token, remate["id"], "Hola")
    msg2 = await _send_chat_message(client, buyer_token, remate["id"], "Otra vez")
    await _send_chat_message(client, owner_token, remate["id"], "Bienvenidos")

    delete = await client.delete(
        f"{REMATES_URL}/{remate['id']}/chat/messages/{msg2['id']}", headers=_auth(owner_token)
    )
    assert delete.status_code == 200, delete.text

    repo = HistoryRepository(db_session)
    row = await repo.get_chat_activity(uuid.UUID(remate["id"]))
    assert row.message_count == 3
    assert row.deleted_count == 1
    assert row.participant_count == 2  # buyer + owner, cada uno una vez


async def test_get_distinct_participant_count_unions_bidders_and_chat_authors(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    _, owner_token = await _owner(client, "hist-repo9@example.com")
    _, buyer1_token = await _buyer(client, "hist-repo9-buyer1@example.com")
    _, buyer2_token = await _buyer(client, "hist-repo9-buyer2@example.com")
    remate = await _create_remate(client, owner_token, title="Con participantes")
    lote = await _create_lote(client, owner_token, remate["id"])
    await _start_remate(client, owner_token, remate["id"])
    await _open_lote(client, owner_token, remate["id"], lote["id"])

    await _bid(client, buyer1_token, remate["id"], lote["id"], "1000.00")  # buyer1: oferta
    await _send_chat_message(client, buyer2_token, remate["id"], "Hola")  # buyer2: solo chat
    await _send_chat_message(client, buyer1_token, remate["id"], "Yo también escribo")  # buyer1: ambos

    repo = HistoryRepository(db_session)
    count = await repo.get_distinct_participant_count(uuid.UUID(remate["id"]))
    assert count == 2  # buyer1 y buyer2, sin duplicar a buyer1 por aparecer en ambos conjuntos


async def test_get_users_by_ids_resolves_known_ids_and_ignores_empty_set(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner_id, _ = await _owner(client, "hist-repo10@example.com")

    repo = HistoryRepository(db_session)
    empty = await repo.get_users_by_ids(set())
    assert empty == {}

    resolved = await repo.get_users_by_ids({uuid.UUID(owner_id)})
    assert uuid.UUID(owner_id) in resolved
    assert resolved[uuid.UUID(owner_id)].email == "hist-repo10@example.com"
