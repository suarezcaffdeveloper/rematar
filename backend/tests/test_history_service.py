"""Tests de `HistoryService` (Épica 7, Módulo 7.3), llamado directamente (sin pasar por
HTTP) contra Postgres real -- mismo criterio y mismos helpers que
`test_audit_service.py`/`test_analytics_service.py`. Los tests de HTTP end-to-end
(200/403/404/422) están en `test_history_router.py`.
"""

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.analytics.repository import AnalyticsRepository
from app.audit.repository import AuditLogRepository
from app.core.exceptions import BusinessRuleError, ForbiddenError, NotFoundError
from app.core.security import hash_password
from app.events.base import DomainEvent
from app.history.repository import HistoryRepository
from app.history.schemas import HistoryListFilters
from app.history.service import HistoryService
from app.modules.remates.lotes.repository import LoteRepository
from app.modules.ofertas.repository import OfertaRepository
from app.modules.remates.repository import RemateRepository
from app.modules.remates.service import RemateService
from app.modules.users.models import User, UserRole

REGISTER_URL = "/api/v1/auth/register"
LOGIN_URL = "/api/v1/auth/login"
REMATES_URL = "/api/v1/remates"


class _NoOpEventBus:
    async def publish(self, event: DomainEvent) -> None:
        pass


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def _register_and_login(client: AsyncClient, *, email: str, role: str) -> tuple[str, str]:
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


async def _get_user_by_email(db_session: AsyncSession, email: str) -> User:
    return (await db_session.execute(select(User).where(User.email == email))).scalar_one()


async def _make_admin(db_session: AsyncSession, email: str) -> User:
    admin = User(
        email=email,
        hashed_password=hash_password("adminpass123"),
        full_name="Admin",
        role=UserRole.ADMIN,
    )
    db_session.add(admin)
    await db_session.commit()
    await db_session.refresh(admin)
    return admin


async def _create_remate(client: AsyncClient, token: str, **overrides) -> dict:
    payload = {
        "title": "Remate de verificación de historial (service)",
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
    client: AsyncClient, token: str, remate_id: str, lote_id: str, *, outcome="unsold", final_price=None
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


async def _finish_a_full_remate(
    client: AsyncClient, owner_token: str, buyer_token: str, *, title: str
) -> dict:
    remate = await _create_remate(client, owner_token, title=title)
    lote = await _create_lote(client, owner_token, remate["id"])
    await _start_remate(client, owner_token, remate["id"])
    await _open_lote(client, owner_token, remate["id"], lote["id"])
    await _bid(client, buyer_token, remate["id"], lote["id"], "1000.00")
    await _close_lote(
        client, owner_token, remate["id"], lote["id"], outcome="sold", final_price="1200.00"
    )
    return remate


def _no_filters() -> HistoryListFilters:
    return HistoryListFilters()


def _make_service(db_session: AsyncSession) -> HistoryService:
    event_bus = _NoOpEventBus()
    remate_service = RemateService(
        RemateRepository(db_session),
        LoteRepository(db_session),
        event_bus,
        AuditLogRepository(db_session),
    )
    return HistoryService(
        HistoryRepository(db_session),
        remate_service,
        AnalyticsRepository(db_session),
        LoteRepository(db_session),
        OfertaRepository(db_session),
    )


# --- list_finished -----------------------------------------------------------------------


async def test_list_finished_denies_comprador(client: AsyncClient, db_session: AsyncSession) -> None:
    _, buyer_token = await _buyer(client, "hist-svc1@example.com")
    viewer = await _get_user_by_email(db_session, "hist-svc1@example.com")
    service = _make_service(db_session)

    with pytest.raises(ForbiddenError):
        await service.list_finished(viewer=viewer, filters=_no_filters(), page=1, page_size=20)


async def test_list_finished_scopes_rematador_to_own_remates(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner1_id, owner1_token = await _owner(client, "hist-svc2-a@example.com")
    _, owner2_token = await _owner(client, "hist-svc2-b@example.com")
    _, buyer_token = await _buyer(client, "hist-svc2-buyer@example.com")

    await _finish_a_full_remate(client, owner1_token, buyer_token, title="Mío")
    await _finish_a_full_remate(client, owner2_token, buyer_token, title="Ajeno")

    viewer = await _get_user_by_email(db_session, "hist-svc2-a@example.com")
    service = _make_service(db_session)
    items, total = await service.list_finished(
        viewer=viewer, filters=_no_filters(), page=1, page_size=20
    )
    assert total == 1
    assert items[0].title == "Mío"
    assert items[0].owner_id == uuid.UUID(owner1_id)


async def test_list_finished_admin_sees_global(client: AsyncClient, db_session: AsyncSession) -> None:
    _, owner_token = await _owner(client, "hist-svc3@example.com")
    _, buyer_token = await _buyer(client, "hist-svc3-buyer@example.com")
    await _finish_a_full_remate(client, owner_token, buyer_token, title="Visible para admin")

    admin = await _make_admin(db_session, "hist-svc3-admin@example.com")
    service = _make_service(db_session)
    items, total = await service.list_finished(
        viewer=admin, filters=_no_filters(), page=1, page_size=20
    )
    assert total >= 1
    assert any(item.title == "Visible para admin" for item in items)


# --- get_detail --------------------------------------------------------------------------


async def test_get_detail_succeeds_for_owner(client: AsyncClient, db_session: AsyncSession) -> None:
    _, owner_token = await _owner(client, "hist-svc4@example.com")
    _, buyer_token = await _buyer(client, "hist-svc4-buyer@example.com")
    remate = await _finish_a_full_remate(client, owner_token, buyer_token, title="Detalle owner")

    owner = await _get_user_by_email(db_session, "hist-svc4@example.com")
    service = _make_service(db_session)
    detail = await service.get_detail(uuid.UUID(remate["id"]), owner)
    assert detail.total_ofertas == 1
    assert detail.lote_status_counts.closed_sold == 1
    assert detail.chat_activity.message_count == 0


async def test_get_detail_denies_unrelated_rematador(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    _, owner_token = await _owner(client, "hist-svc5@example.com")
    _, buyer_token = await _buyer(client, "hist-svc5-buyer@example.com")
    remate = await _finish_a_full_remate(client, owner_token, buyer_token, title="Detalle ajeno")

    _, stranger_token = await _owner(client, "hist-svc5-stranger@example.com")
    stranger = await _get_user_by_email(db_session, "hist-svc5-stranger@example.com")
    service = _make_service(db_session)

    with pytest.raises(ForbiddenError):
        await service.get_detail(uuid.UUID(remate["id"]), stranger)


async def test_get_detail_raises_business_rule_error_for_non_terminal_remate(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    _, owner_token = await _owner(client, "hist-svc6@example.com")
    remate = await _create_remate(client, owner_token, title="Todavía en borrador")
    owner = await _get_user_by_email(db_session, "hist-svc6@example.com")
    service = _make_service(db_session)

    with pytest.raises(BusinessRuleError):
        await service.get_detail(uuid.UUID(remate["id"]), owner)


# --- get_lote_detail ---------------------------------------------------------------------


async def test_get_lote_detail_reports_winner_for_sold_lote(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner_id, owner_token = await _owner(client, "hist-svc7@example.com")
    buyer_id, buyer_token = await _buyer(client, "hist-svc7-buyer@example.com")
    remate = await _finish_a_full_remate(client, owner_token, buyer_token, title="Detalle de lote")

    lotes = (await client.get(f"{REMATES_URL}/{remate['id']}/lotes", headers=_auth(owner_token))).json()
    lote_id = lotes["items"][0]["id"]

    owner = await _get_user_by_email(db_session, "hist-svc7@example.com")
    service = _make_service(db_session)
    detail = await service.get_lote_detail(
        uuid.UUID(remate["id"]), uuid.UUID(lote_id), owner, page=1, page_size=20
    )
    assert detail.winner is not None
    assert detail.winner.buyer_id == uuid.UUID(buyer_id)
    assert detail.offer_count == 1
    assert detail.offer_history.total == 1


async def test_get_lote_detail_no_winner_for_unsold_lote(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    _, owner_token = await _owner(client, "hist-svc8@example.com")
    remate = await _create_remate(client, owner_token, title="Lote no vendido")
    lote = await _create_lote(client, owner_token, remate["id"])
    await _start_remate(client, owner_token, remate["id"])
    await _open_lote(client, owner_token, remate["id"], lote["id"])
    await _close_lote(client, owner_token, remate["id"], lote["id"], outcome="unsold")

    owner = await _get_user_by_email(db_session, "hist-svc8@example.com")
    service = _make_service(db_session)
    detail = await service.get_lote_detail(
        uuid.UUID(remate["id"]), uuid.UUID(lote["id"]), owner, page=1, page_size=20
    )
    assert detail.winner is None


async def test_get_lote_detail_raises_not_found_for_lote_of_another_remate(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    _, owner_token = await _owner(client, "hist-svc9@example.com")
    _, buyer_token = await _buyer(client, "hist-svc9-buyer@example.com")
    remate_a = await _finish_a_full_remate(client, owner_token, buyer_token, title="Remate A")
    remate_b = await _create_remate(client, owner_token, title="Remate B")
    lote_b = await _create_lote(client, owner_token, remate_b["id"])

    owner = await _get_user_by_email(db_session, "hist-svc9@example.com")
    service = _make_service(db_session)

    with pytest.raises(NotFoundError):
        await service.get_lote_detail(
            uuid.UUID(remate_a["id"]), uuid.UUID(lote_b["id"]), owner, page=1, page_size=20
        )
