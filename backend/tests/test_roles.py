"""Tests del RBAC de administrador: listar usuarios y suspender cuentas (RF-03)."""

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.modules.users.models import User, UserRole

REGISTER_URL = "/api/v1/auth/register"
LOGIN_URL = "/api/v1/auth/login"
USERS_URL = "/api/v1/users"


async def _create_admin_directly(db_session: AsyncSession, email: str) -> None:
    """Los admins no se crean por la API pública (ADR-010); acá se insertan
    directamente, igual que hace `app/scripts/create_superuser.py` en producción."""
    db_session.add(
        User(
            email=email,
            hashed_password=hash_password("adminpass123"),
            full_name="Admin Test",
            role=UserRole.ADMIN,
        )
    )
    await db_session.commit()


async def test_admin_can_list_and_suspend_users(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    await _create_admin_directly(db_session, "admin-test@example.com")

    register_response = await client.post(
        REGISTER_URL,
        json={
            "email": "rematador-test@example.com",
            "password": "password123",
            "confirm_password": "password123",
            "full_name": "Rematador",
            "phone": "+5491122334455",
            "role": "rematador",
        },
    )
    rematador_id = register_response.json()["id"]

    admin_login = await client.post(
        LOGIN_URL, data={"username": "admin-test@example.com", "password": "adminpass123"}
    )
    admin_token = admin_login.json()["access_token"]
    headers = {"Authorization": f"Bearer {admin_token}"}

    list_response = await client.get(USERS_URL, headers=headers)
    assert list_response.status_code == 200
    assert list_response.json()["total"] == 2  # admin + rematador

    suspend_response = await client.patch(
        f"{USERS_URL}/{rematador_id}/status", headers=headers, json={"is_active": False}
    )
    assert suspend_response.status_code == 200
    assert suspend_response.json()["is_active"] is False

    blocked_login = await client.post(
        LOGIN_URL,
        data={"username": "rematador-test@example.com", "password": "password123"},
    )
    assert blocked_login.status_code == 401
