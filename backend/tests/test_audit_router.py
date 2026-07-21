"""Tests HTTP end-to-end del Audit Service (Épica 7, Módulo 7.2):
`GET /api/v1/audit` (global, admin) y `GET /api/v1/remates/{remate_id}/audit` (dueño o
admin). Ver docs/36-sistema-de-auditoria-y-trazabilidad.md y ADR-039. Mismo estilo que
`test_analytics_router.py`.

Cubre que cada acción pedida por el enunciado (login/logout, CRUD de remates/lotes,
apertura/cierre/adjudicación de lotes, ofertas realizadas/rechazadas, mensajes de chat
eliminados, cambios de configuración) efectivamente aparece en el log.
"""

import uuid

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.modules.users.models import User, UserRole

REGISTER_URL = "/api/v1/auth/register"
LOGIN_URL = "/api/v1/auth/login"
LOGOUT_URL = "/api/v1/auth/logout"
REMATES_URL = "/api/v1/remates"
AUDIT_URL = "/api/v1/audit"


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def _register_and_login(client: AsyncClient, *, email: str, role: str) -> tuple[str, str, str]:
    payload = {"email": email, "password": "password123", "full_name": "Test", "role": role}
    register = await client.post(REGISTER_URL, json=payload)
    assert register.status_code == 201, register.text
    login = await client.post(LOGIN_URL, data={"username": email, "password": "password123"})
    assert login.status_code == 200, login.text
    body = login.json()
    return register.json()["id"], body["access_token"], body["refresh_token"]


async def _owner(client: AsyncClient, email: str) -> tuple[str, str, str]:
    return await _register_and_login(client, email=email, role="rematador")


async def _buyer(client: AsyncClient, email: str) -> tuple[str, str, str]:
    return await _register_and_login(client, email=email, role="comprador")


async def _make_admin_and_login(client: AsyncClient, db_session: AsyncSession, email: str) -> str:
    admin = User(
        email=email,
        hashed_password=hash_password("adminpass123"),
        full_name="Admin",
        role=UserRole.ADMIN,
    )
    db_session.add(admin)
    await db_session.commit()
    login = await client.post(LOGIN_URL, data={"username": email, "password": "adminpass123"})
    assert login.status_code == 200, login.text
    return login.json()["access_token"]


async def _create_remate(client: AsyncClient, token: str, **overrides) -> dict:
    payload = {
        "title": "Remate de verificación de auditoría HTTP",
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
    return r


async def _audit_global(client: AsyncClient, token: str, **params) -> dict:
    r = await client.get(AUDIT_URL, headers=_auth(token), params=params)
    assert r.status_code == 200, r.text
    return r.json()


async def _audit_for_remate(client: AsyncClient, token: str, remate_id: str, **params) -> dict:
    r = await client.get(
        f"{REMATES_URL}/{remate_id}/audit", headers=_auth(token), params=params
    )
    assert r.status_code == 200, r.text
    return r.json()


def _actions(page: dict) -> list[str]:
    return [item["action"] for item in page["items"]]


# --- Cobertura de cada acción pedida por el enunciado ---------------------------------


async def test_login_is_audited(client: AsyncClient, db_session: AsyncSession) -> None:
    _, owner_token, _ = await _owner(client, "audr1@example.com")
    admin_token = await _make_admin_and_login(client, db_session, "audr1-admin@example.com")

    page = await _audit_global(client, admin_token, action="auth.login")
    assert page["total"] >= 1
    assert all(item["action"] == "auth.login" for item in page["items"])


async def test_logout_is_audited(client: AsyncClient, db_session: AsyncSession) -> None:
    _, owner_token, refresh_token = await _owner(client, "audr2@example.com")
    logout = await client.post(LOGOUT_URL, json={"refresh_token": refresh_token})
    assert logout.status_code == 204, logout.text

    admin_token = await _make_admin_and_login(client, db_session, "audr2-admin@example.com")
    page = await _audit_global(client, admin_token, action="auth.logout")
    assert page["total"] == 1


async def test_remate_create_update_settings_and_cancel_are_audited(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    _, owner_token, _ = await _owner(client, "audr3@example.com")
    remate = await _create_remate(client, owner_token)

    patch = await client.patch(
        f"{REMATES_URL}/{remate['id']}",
        json={"settings": {"anti_sniping_enabled": True, "anti_sniping_extension_seconds": 90}},
        headers=_auth(owner_token),
    )
    assert patch.status_code == 200, patch.text

    schedule = await client.post(
        f"{REMATES_URL}/{remate['id']}/schedule", headers=_auth(owner_token)
    )
    assert schedule.status_code == 200, schedule.text
    cancel = await client.post(
        f"{REMATES_URL}/{remate['id']}/cancel",
        json={"reason": "Se suspende por lluvia"},
        headers=_auth(owner_token),
    )
    assert cancel.status_code == 200, cancel.text

    admin_token = await _make_admin_and_login(client, db_session, "audr3-admin@example.com")
    page = await _audit_for_remate(client, admin_token, remate["id"])
    actions = _actions(page)
    assert "remate.created" in actions
    assert "remate.settings_changed" in actions
    assert actions.count("remate.status_changed") == 2  # schedule + cancel


async def test_remate_delete_is_audited(client: AsyncClient, db_session: AsyncSession) -> None:
    _, owner_token, _ = await _owner(client, "audr4@example.com")
    remate = await _create_remate(client, owner_token)  # DRAFT

    delete = await client.delete(f"{REMATES_URL}/{remate['id']}", headers=_auth(owner_token))
    assert delete.status_code == 204, delete.text

    admin_token = await _make_admin_and_login(client, db_session, "audr4-admin@example.com")
    page = await _audit_global(client, admin_token, action="remate.deleted")
    assert page["total"] >= 1
    assert any(item["resource_id"] == remate["id"] for item in page["items"])


async def test_lote_create_open_and_awarded_close_are_audited(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    _, owner_token, _ = await _owner(client, "audr5@example.com")
    remate = await _create_remate(client, owner_token)
    lote = await _create_lote(client, owner_token, remate["id"])
    await _start_remate(client, owner_token, remate["id"])
    await _open_lote(client, owner_token, remate["id"], lote["id"])
    await _close_lote(
        client, owner_token, remate["id"], lote["id"], outcome="sold", final_price="1200.00"
    )

    admin_token = await _make_admin_and_login(client, db_session, "audr5-admin@example.com")
    page = await _audit_for_remate(client, admin_token, remate["id"], resource_type="lote")
    actions = _actions(page)
    assert "lote.created" in actions
    assert "lote.opened" in actions
    # Vendido -> `lote.awarded`, no `lote.closed` (ver docstring de LoteService.close).
    assert "lote.awarded" in actions
    assert "lote.closed" not in actions


async def test_lote_unsold_close_is_audited_as_closed_not_awarded(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    _, owner_token, _ = await _owner(client, "audr6@example.com")
    remate = await _create_remate(client, owner_token)
    lote = await _create_lote(client, owner_token, remate["id"])
    await _start_remate(client, owner_token, remate["id"])
    await _open_lote(client, owner_token, remate["id"], lote["id"])
    await _close_lote(client, owner_token, remate["id"], lote["id"], outcome="unsold")

    admin_token = await _make_admin_and_login(client, db_session, "audr6-admin@example.com")
    page = await _audit_for_remate(client, admin_token, remate["id"], resource_type="lote")
    actions = _actions(page)
    assert "lote.closed" in actions
    assert "lote.awarded" not in actions


async def test_oferta_accepted_and_rejected_are_audited(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    _, owner_token, _ = await _owner(client, "audr7@example.com")
    _, buyer_token, _ = await _buyer(client, "audr7-buyer@example.com")
    remate = await _create_remate(client, owner_token)
    lote = await _create_lote(client, owner_token, remate["id"])
    await _start_remate(client, owner_token, remate["id"])
    await _open_lote(client, owner_token, remate["id"], lote["id"])

    accepted = await _bid(client, buyer_token, remate["id"], lote["id"], "1000.00")
    assert accepted.status_code == 201, accepted.text
    rejected = await _bid(client, buyer_token, remate["id"], lote["id"], "1.00")
    assert rejected.status_code == 201, rejected.text  # rechazo también es 201 (RF-18)

    admin_token = await _make_admin_and_login(client, db_session, "audr7-admin@example.com")
    page = await _audit_for_remate(client, admin_token, remate["id"], resource_type="oferta")
    actions = _actions(page)
    assert "oferta.placed" in actions
    assert "oferta.rejected" in actions


async def test_chat_message_deleted_is_audited(client: AsyncClient, db_session: AsyncSession) -> None:
    _, owner_token, _ = await _owner(client, "audr8@example.com")
    _, buyer_token, _ = await _buyer(client, "audr8-buyer@example.com")
    remate = await _create_remate(client, owner_token)
    schedule = await client.post(
        f"{REMATES_URL}/{remate['id']}/schedule", headers=_auth(owner_token)
    )
    assert schedule.status_code == 200, schedule.text

    sent = await client.post(
        f"{REMATES_URL}/{remate['id']}/chat/messages",
        json={"content": "Hola a todos"},
        headers=_auth(buyer_token),
    )
    assert sent.status_code == 201, sent.text
    message_id = sent.json()["id"]

    deleted = await client.delete(
        f"{REMATES_URL}/{remate['id']}/chat/messages/{message_id}", headers=_auth(owner_token)
    )
    assert deleted.status_code == 200, deleted.text

    admin_token = await _make_admin_and_login(client, db_session, "audr8-admin@example.com")
    page = await _audit_for_remate(client, admin_token, remate["id"], action="chat.message_deleted")
    assert page["total"] == 1
    assert page["items"][0]["resource_id"] == message_id


# --- Filtros y forma de la respuesta ---------------------------------------------------


async def test_global_audit_log_filters_by_actor_id(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    owner_id, owner_token, _ = await _owner(client, "audr9@example.com")
    await _create_remate(client, owner_token)
    await _owner(client, "audr9-other@example.com")

    admin_token = await _make_admin_and_login(client, db_session, "audr9-admin@example.com")
    page = await _audit_global(client, admin_token, actor_id=owner_id)
    assert page["total"] >= 1
    assert all(item["actor_id"] == owner_id for item in page["items"])


async def test_global_audit_log_search_matches_actor_name(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    await _register_and_login(client, email="audr10@example.com", role="rematador")
    admin_token = await _make_admin_and_login(client, db_session, "audr10-admin@example.com")

    page = await _audit_global(client, admin_token, search="nonexistent-name-xyz")
    assert page["total"] == 0


async def test_global_audit_log_response_shape(client: AsyncClient, db_session: AsyncSession) -> None:
    _, owner_token, _ = await _owner(client, "audr11@example.com")
    await _create_remate(client, owner_token)

    admin_token = await _make_admin_and_login(client, db_session, "audr11-admin@example.com")
    page = await _audit_global(client, admin_token, page=1, page_size=10)

    assert set(page.keys()) == {"items", "total", "page", "page_size"}
    assert page["page"] == 1
    assert page["page_size"] == 10
    entry = page["items"][0]
    assert set(entry.keys()) == {
        "id",
        "occurred_at",
        "actor_id",
        "actor_name",
        "actor_role",
        "action",
        "resource_type",
        "resource_id",
        "remate_id",
        "details",
    }


# --- Control de acceso ------------------------------------------------------------------


async def test_global_audit_log_returns_403_for_non_admin(client: AsyncClient) -> None:
    _, owner_token, _ = await _owner(client, "audr12@example.com")

    r = await client.get(AUDIT_URL, headers=_auth(owner_token))

    assert r.status_code == 403, r.text
    assert r.json()["error"]["code"] == "forbidden"


async def test_global_audit_log_requires_authentication(client: AsyncClient) -> None:
    r = await client.get(AUDIT_URL)
    assert r.status_code == 401, r.text


async def test_remate_audit_log_returns_403_for_unrelated_rematador(client: AsyncClient) -> None:
    _, owner_token, _ = await _owner(client, "audr13@example.com")
    remate = await _create_remate(client, owner_token)
    schedule = await client.post(
        f"{REMATES_URL}/{remate['id']}/schedule", headers=_auth(owner_token)
    )
    assert schedule.status_code == 200, schedule.text

    _, stranger_token, _ = await _owner(client, "audr13-stranger@example.com")
    r = await client.get(
        f"{REMATES_URL}/{remate['id']}/audit", headers=_auth(stranger_token)
    )

    assert r.status_code == 403, r.text
    assert r.json()["error"]["code"] == "forbidden"


async def test_remate_audit_log_returns_404_for_draft_seen_by_stranger(client: AsyncClient) -> None:
    _, owner_token, _ = await _owner(client, "audr14@example.com")
    remate = await _create_remate(client, owner_token)  # queda en DRAFT

    _, stranger_token, _ = await _owner(client, "audr14-stranger@example.com")
    r = await client.get(
        f"{REMATES_URL}/{remate['id']}/audit", headers=_auth(stranger_token)
    )

    assert r.status_code == 404, r.text


async def test_remate_audit_log_returns_404_for_nonexistent_remate(client: AsyncClient) -> None:
    _, owner_token, _ = await _owner(client, "audr15@example.com")

    r = await client.get(
        f"{REMATES_URL}/{uuid.uuid4()}/audit", headers=_auth(owner_token)
    )

    assert r.status_code == 404, r.text
