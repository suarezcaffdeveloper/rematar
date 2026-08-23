"""Tests del RBAC de administrador: listar usuarios, aprobar cuentas pendientes y
suspender cuentas (RF-03).

En condiciones normales, empresa/rematador quedan `is_active=False` al registrarse
(pendientes de aprobación -- ver `UserService.register`), y el mismo endpoint
`PATCH /users/{id}/status` que ya servía para suspender una cuenta activa también sirve
para aprobarla por primera vez (el estado es el mismo campo, `is_active`, sin un flujo
separado). Ahora mismo ambos roles quedan activos de inmediato de forma temporal
mientras se testean las 4 vistas de rol -- ver el TODO en `ROLES_PENDING_APPROVAL`
(schemas.py)."""

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


async def _create_pending_empresa_directly(db_session: AsyncSession, email: str) -> str:
    """Empresa ya no nace pendiente al registrarse por la API pública (temporal, ver el
    TODO en `ROLES_PENDING_APPROVAL`, schemas.py) -- los tests que ejercitan el propio
    endpoint de aprobación (`PATCH /users/{id}/status` sobre una cuenta `is_active=False`)
    arman esa precondición a mano en vez de depender de `_register`, mismo criterio que
    `_create_admin_directly`."""
    user = User(
        email=email,
        hashed_password=hash_password("password123"),
        full_name="Empresa",
        phone="+5491122334455",
        role=UserRole.EMPRESA,
        is_active=False,
    )
    db_session.add(user)
    await db_session.commit()
    return str(user.id)


async def _register(client: AsyncClient, *, email: str, role: str, full_name: str = "Test") -> str:
    response = await client.post(
        REGISTER_URL,
        json={
            "email": email,
            "password": "password123",
            "confirm_password": "password123",
            "full_name": full_name,
            "phone": "+5491122334455",
            "role": role,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


async def test_empresa_registration_is_publicly_allowed_and_starts_active(
    client: AsyncClient,
) -> None:
    """Temporal mientras se testea el flujo en vivo -- ver el TODO en
    `ROLES_PENDING_APPROVAL` (schemas.py)."""
    response = await client.post(
        REGISTER_URL,
        json={
            "email": "empresa-active@example.com",
            "password": "password123",
            "confirm_password": "password123",
            "full_name": "Empresa",
            "phone": "+5491122334455",
            "role": "empresa",
        },
    )
    assert response.status_code == 201, response.text
    assert response.json()["is_active"] is True


async def test_rematador_registration_is_publicly_allowed_and_starts_active(
    client: AsyncClient,
) -> None:
    """Temporal mientras se testea el flujo en vivo -- ver el TODO en
    `ROLES_PENDING_APPROVAL` (schemas.py)."""
    response = await client.post(
        REGISTER_URL,
        json={
            "email": "rematador-active@example.com",
            "password": "password123",
            "confirm_password": "password123",
            "full_name": "Rematador",
            "phone": "+5491122334455",
            "role": "rematador",
        },
    )
    assert response.status_code == 201, response.text
    assert response.json()["is_active"] is True


async def test_comprador_registration_stays_instantly_active(client: AsyncClient) -> None:
    response = await client.post(
        REGISTER_URL,
        json={
            "email": "comprador-instant@example.com",
            "password": "password123",
            "confirm_password": "password123",
            "full_name": "Comprador",
            "phone": "+5491122334455",
            "role": "comprador",
        },
    )
    assert response.status_code == 201, response.text
    assert response.json()["is_active"] is True

    login = await client.post(
        LOGIN_URL, data={"username": "comprador-instant@example.com", "password": "password123"}
    )
    assert login.status_code == 200, login.text


async def test_pending_empresa_cannot_login_until_admin_approves(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    await _create_admin_directly(db_session, "admin-approve@example.com")
    empresa_id = await _create_pending_empresa_directly(db_session, "empresa-approve@example.com")

    blocked_login = await client.post(
        LOGIN_URL,
        data={"username": "empresa-approve@example.com", "password": "password123"},
    )
    assert blocked_login.status_code == 401

    admin_login = await client.post(
        LOGIN_URL, data={"username": "admin-approve@example.com", "password": "adminpass123"}
    )
    headers = {"Authorization": f"Bearer {admin_login.json()['access_token']}"}

    approve_response = await client.patch(
        f"{USERS_URL}/{empresa_id}/status", headers=headers, json={"is_active": True}
    )
    assert approve_response.status_code == 200
    assert approve_response.json()["is_active"] is True

    approved_login = await client.post(
        LOGIN_URL,
        data={"username": "empresa-approve@example.com", "password": "password123"},
    )
    assert approved_login.status_code == 200, approved_login.text


async def test_admin_can_filter_pending_only_users(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    await _create_admin_directly(db_session, "admin-filter@example.com")
    pending_id = await _create_pending_empresa_directly(db_session, "empresa-pending2@example.com")
    await _register(client, email="comprador-active@example.com", role="comprador")

    admin_login = await client.post(
        LOGIN_URL, data={"username": "admin-filter@example.com", "password": "adminpass123"}
    )
    headers = {"Authorization": f"Bearer {admin_login.json()['access_token']}"}

    response = await client.get(f"{USERS_URL}?pending_only=true", headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    assert body["items"][0]["id"] == pending_id


async def test_admin_can_list_and_suspend_users(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    await _create_admin_directly(db_session, "admin-test@example.com")
    empresa_id = await _register(client, email="empresa-test@example.com", role="empresa")

    admin_login = await client.post(
        LOGIN_URL, data={"username": "admin-test@example.com", "password": "adminpass123"}
    )
    admin_token = admin_login.json()["access_token"]
    headers = {"Authorization": f"Bearer {admin_token}"}

    list_response = await client.get(USERS_URL, headers=headers)
    assert list_response.status_code == 200
    assert list_response.json()["total"] == 2  # admin + empresa

    suspend_response = await client.patch(
        f"{USERS_URL}/{empresa_id}/status", headers=headers, json={"is_active": False}
    )
    assert suspend_response.status_code == 200
    assert suspend_response.json()["is_active"] is False

    blocked_login = await client.post(
        LOGIN_URL,
        data={"username": "empresa-test@example.com", "password": "password123"},
    )
    assert blocked_login.status_code == 401
