"""Tests HTTP end-to-end del Monitoring Service (Épica 8, Módulo 8.1):
`GET /api/v1/monitoring/health` (público) y `GET /api/v1/monitoring/metrics`
(admin-only). Ver docs/38-observabilidad-y-monitoreo.md y ADR-041. Mismo estilo que
`test_audit_router.py`.
"""

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.modules.users.models import User, UserRole
from tests._role_test_helpers import activate_pending_account

REGISTER_URL = "/api/v1/auth/register"
LOGIN_URL = "/api/v1/auth/login"
HEALTH_URL = "/api/v1/monitoring/health"
METRICS_URL = "/api/v1/monitoring/metrics"


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def _register_and_login(client: AsyncClient, *, email: str, role: str) -> str:
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
    if role in ("empresa", "rematador"):
        await activate_pending_account(email)
    login = await client.post(LOGIN_URL, data={"username": email, "password": "password123"})
    assert login.status_code == 200, login.text
    return login.json()["access_token"]


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


# --- GET /monitoring/health --------------------------------------------------------------


async def test_health_endpoint_is_public_and_reports_all_four_components(
    client: AsyncClient,
) -> None:
    r = await client.get(HEALTH_URL)
    assert r.status_code == 200, r.text
    data = r.json()

    assert data["status"] in ("ok", "degraded")
    components = {check["component"] for check in data["checks"]}
    assert components == {"api", "postgres", "redis", "websocket"}
    assert all(check["status"] == "ok" for check in data["checks"])


# --- GET /monitoring/metrics ---------------------------------------------------------------


async def test_metrics_endpoint_requires_authentication(client: AsyncClient) -> None:
    r = await client.get(METRICS_URL)
    assert r.status_code == 401, r.text


async def test_metrics_endpoint_returns_403_for_non_admin(client: AsyncClient) -> None:
    token = await _register_and_login(client, email="monr1@example.com", role="empresa")
    r = await client.get(METRICS_URL, headers=_auth(token))
    assert r.status_code == 403, r.text
    assert r.json()["error"]["code"] == "forbidden"


async def test_metrics_endpoint_returns_full_shape_for_admin(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    admin_token = await _make_admin_and_login(client, db_session, "monr2-admin@example.com")
    r = await client.get(METRICS_URL, headers=_auth(admin_token))
    assert r.status_code == 200, r.text
    data = r.json()

    assert set(data.keys()) == {
        "connected_users",
        "active_websockets",
        "chat_messages_per_minute",
        "ofertas_per_minute",
        "avg_oferta_processing_ms",
        "avg_api_response_ms",
        "errors_last_minute",
        "memory_usage_mb",
        "cpu_usage_percent",
        "generated_at",
    }
    assert data["connected_users"] >= 0
    assert data["active_websockets"] >= 0
