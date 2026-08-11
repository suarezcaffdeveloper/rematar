"""Tests de `MonitoringRepository` (Épica 8, Módulo 8.1), directos contra Postgres real
(sin mocks, mismo criterio que el resto de la suite). A diferencia de
`AnalyticsRepository`, acá los conteos son **globales** (toda la plataforma).
"""

from datetime import UTC, datetime, timedelta

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.chat.models import ChatMessage
from app.modules.ofertas.models import Oferta
from app.monitoring.repository import MonitoringRepository

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
        "title": "Remate de verificación de monitoreo",
        "category": "hacienda",
        "starts_at": "2027-06-01T10:00:00Z",
    }
    payload.update(overrides)
    r = await client.post(REMATES_URL, json=payload, headers=_auth(token))
    assert r.status_code == 201, r.text
    return r.json()


async def _create_lote(client: AsyncClient, token: str, remate_id: str) -> dict:
    payload = {
        "lot_number": "1",
        "title": "Toro Angus",
        "category": "hacienda",
        "base_price": "1000.00",
        "min_increment": "100.00",
    }
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


async def test_count_ofertas_since_counts_only_recent_ofertas(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    _, owner_token = await _owner(client, "mon-repo1@example.com")
    _, buyer_token = await _buyer(client, "mon-repo1-buyer@example.com")
    remate = await _create_remate(client, owner_token)
    lote = await _create_lote(client, owner_token, remate["id"])
    await _start_remate(client, owner_token, remate["id"])
    await _open_lote(client, owner_token, remate["id"], lote["id"])

    old_oferta = await _bid(client, buyer_token, remate["id"], lote["id"], "1000.00")
    old_row = await db_session.get(Oferta, old_oferta["id"])
    old_row.created_at = datetime.now(UTC) - timedelta(hours=1)
    await db_session.commit()

    await _bid(client, buyer_token, remate["id"], lote["id"], "1200.00")

    repo = MonitoringRepository(db_session)
    since = datetime.now(UTC) - timedelta(minutes=1)
    count = await repo.count_ofertas_since(since)
    assert count == 1


async def test_count_chat_messages_since_excludes_system_messages_and_old_ones(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    _, owner_token = await _owner(client, "mon-repo2@example.com")
    _, buyer_token = await _buyer(client, "mon-repo2-buyer@example.com")
    remate = await _create_remate(client, owner_token)
    await _create_lote(client, owner_token, remate["id"])
    await _start_remate(client, owner_token, remate["id"])  # dispara un mensaje de sistema

    await _send_chat_message(client, buyer_token, remate["id"], "Hola")
    old_message = await _send_chat_message(client, buyer_token, remate["id"], "Viejo")
    old_row = await db_session.get(ChatMessage, old_message["id"])
    old_row.created_at = datetime.now(UTC) - timedelta(hours=1)
    await db_session.commit()

    repo = MonitoringRepository(db_session)
    since = datetime.now(UTC) - timedelta(minutes=1)
    count = await repo.count_chat_messages_since(since)
    assert count == 1  # solo "Hola" -- ni el mensaje viejo ni el de sistema


async def test_counts_are_zero_without_any_activity(db_session: AsyncSession) -> None:
    repo = MonitoringRepository(db_session)
    since = datetime.now(UTC) - timedelta(minutes=1)
    assert await repo.count_ofertas_since(since) == 0
    assert await repo.count_chat_messages_since(since) == 0
