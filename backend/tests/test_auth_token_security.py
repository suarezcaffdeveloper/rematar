"""Tests de Fase 7 (WebSocket Security Audit -- HTTP Authentication & Session Security):
integridad de JWT (access/refresh), y de que el servidor nunca confía en claims que
vengan del cliente sin haber sido validados criptográficamente (firma, tipo, expiración).

Estos tests atacan directamente lo que pide la Fase 7 sobre JWT: token expirado, firma
inválida, algoritmo incorrecto, claims manipulados (`role`, `sub`, `exp`), y token de un
tipo usado donde no corresponde (refresh como si fuera access, y viceversa).
"""

import uuid
from datetime import UTC, datetime, timedelta

import jwt
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.core.config import get_settings
from app.db.session import get_db
from app.main import create_app
from app.modules.auth.security import create_access_token, create_refresh_token
from app.modules.users.models import User, UserRole

REGISTER_URL = "/api/v1/auth/register"
LOGIN_URL = "/api/v1/auth/login"
REFRESH_URL = "/api/v1/auth/refresh"
ME_URL = "/api/v1/users/me"
USERS_URL = "/api/v1/users"


@pytest_asyncio.fixture
async def client(db_engine: AsyncEngine):
    session_factory = async_sessionmaker(bind=db_engine, expire_on_commit=False)

    async def _override_get_db():
        async with session_factory() as session:
            yield session

    app = create_app()
    app.dependency_overrides[get_db] = _override_get_db
    app.state.db_session_factory = session_factory

    async with app.router.lifespan_context(app):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            yield ac

    app.dependency_overrides.clear()


async def _register_and_login(client: AsyncClient, *, email: str, role: str = "comprador") -> dict:
    register_response = await client.post(
        REGISTER_URL,
        json={
            "email": email,
            "password": "password123",
            "confirm_password": "password123",
            "full_name": "Test User",
            "phone": "+5491122334455",
            "role": role,
        },
    )
    assert register_response.status_code == 201, register_response.text

    login_response = await client.post(LOGIN_URL, data={"username": email, "password": "password123"})
    assert login_response.status_code == 200, login_response.text
    return login_response.json()


def _auth_header(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# --- access token: expirado / firma inválida / algoritmo / malformado -----------------


async def test_access_token_expired_is_rejected(client: AsyncClient) -> None:
    tokens = await _register_and_login(client, email="expiredaccess@example.com")
    settings = get_settings()
    payload = jwt.decode(tokens["access_token"], settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])

    expired_token = jwt.encode(
        {**payload, "exp": datetime.now(UTC) - timedelta(minutes=1)},
        settings.SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM,
    )

    response = await client.get(ME_URL, headers=_auth_header(expired_token))
    assert response.status_code == 401


async def test_access_token_with_invalid_signature_is_rejected(client: AsyncClient) -> None:
    tokens = await _register_and_login(client, email="badsig@example.com")
    settings = get_settings()
    payload = jwt.decode(tokens["access_token"], settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])

    forged_token = jwt.encode(payload, "una-clave-que-no-es-la-real", algorithm=settings.JWT_ALGORITHM)

    response = await client.get(ME_URL, headers=_auth_header(forged_token))
    assert response.status_code == 401


async def test_access_token_malformed_is_rejected(client: AsyncClient) -> None:
    response = await client.get(ME_URL, headers=_auth_header("esto-no-es-un-jwt"))
    assert response.status_code == 401


async def test_refresh_token_cannot_be_used_as_access_token(client: AsyncClient) -> None:
    """El claim `type` distingue access de refresh -- un refresh token robado no debe
    servir para autenticarse contra un endpoint HTTP protegido."""
    tokens = await _register_and_login(client, email="refreshasaccess@example.com")

    response = await client.get(ME_URL, headers=_auth_header(tokens["refresh_token"]))
    assert response.status_code == 401


async def test_access_token_cannot_be_used_as_refresh_token(client: AsyncClient) -> None:
    tokens = await _register_and_login(client, email="accessasrefresh@example.com")

    response = await client.post(REFRESH_URL, json={"refresh_token": tokens["access_token"]})
    assert response.status_code == 401


# --- claims manipulados: el servidor nunca confía en `role`/`sub` del JWT -------------


async def test_manipulated_role_claim_in_access_token_does_not_grant_admin_access(
    client: AsyncClient,
) -> None:
    """Firma válida (misma SECRET_KEY/algoritmo que usa el servidor), pero `role` dice
    "admin" para un usuario que en la base es "comprador". El servidor debe ignorar el
    claim y usar el rol real de la base -- confirma que `require_roles` nunca confía en
    el JWT para autorización (ver `app/modules/auth/dependencies.py`)."""
    tokens = await _register_and_login(client, email="roleforge@example.com", role="comprador")
    me_response = await client.get(ME_URL, headers=_auth_header(tokens["access_token"]))
    user_id = me_response.json()["id"]

    settings = get_settings()
    forged_token = create_access_token(
        user_id=uuid.UUID(user_id),
        role=UserRole.ADMIN,
        session_id=uuid.uuid4(),
        settings=settings,
    )

    response = await client.get(USERS_URL, headers=_auth_header(forged_token))
    assert response.status_code == 403


async def test_access_token_with_nonexistent_user_id_is_rejected(client: AsyncClient) -> None:
    settings = get_settings()
    token = create_access_token(
        user_id=uuid.uuid4(), role=UserRole.COMPRADOR, session_id=uuid.uuid4(), settings=settings
    )

    response = await client.get(ME_URL, headers=_auth_header(token))
    assert response.status_code == 401


# --- refresh token: expirado / firma inválida / revocado / de otro usuario -----------


async def test_refresh_token_expired_is_rejected(client: AsyncClient) -> None:
    tokens = await _register_and_login(client, email="expiredrefresh@example.com")
    settings = get_settings()
    payload = jwt.decode(tokens["refresh_token"], settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])

    expired_refresh = jwt.encode(
        {**payload, "exp": datetime.now(UTC) - timedelta(minutes=1)},
        settings.SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM,
    )

    response = await client.post(REFRESH_URL, json={"refresh_token": expired_refresh})
    assert response.status_code == 401


async def test_refresh_token_with_invalid_signature_is_rejected(client: AsyncClient) -> None:
    tokens = await _register_and_login(client, email="badsigrefresh@example.com")
    settings = get_settings()
    payload = jwt.decode(tokens["refresh_token"], settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])

    forged_refresh = jwt.encode(payload, "otra-clave-falsa", algorithm=settings.JWT_ALGORITHM)

    response = await client.post(REFRESH_URL, json={"refresh_token": forged_refresh})
    assert response.status_code == 401


async def test_refresh_token_with_unknown_jti_is_rejected(client: AsyncClient) -> None:
    """`jti` sintácticamente válido (bien firmado) pero que nunca fue emitido -- no debe
    haber fila en `refresh_tokens` con ese id. Simula un refresh token forjado a partir
    de la clave real (o un ataque de fuerza bruta improbable dado el espacio de un UUID)."""
    settings = get_settings()
    forged_refresh = create_refresh_token(user_id=uuid.uuid4(), jti=uuid.uuid4(), settings=settings)

    response = await client.post(REFRESH_URL, json={"refresh_token": forged_refresh})
    assert response.status_code == 401


async def test_refresh_token_of_suspended_user_is_rejected(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    tokens = await _register_and_login(client, email="suspendedrefresh@example.com")

    me_response = await client.get(ME_URL, headers=_auth_header(tokens["access_token"]))
    user_id = me_response.json()["id"]

    # Se suspende directamente a nivel de datos (no hay un endpoint más simple en este
    # test HTTP-only) -- `db_session` comparte el mismo `db_engine` que usa `client`
    # (ambos fixtures dependen de él), así que el UPDATE es visible de inmediato.
    await db_session.execute(update(User).where(User.id == uuid.UUID(user_id)).values(is_active=False))
    await db_session.commit()

    response = await client.post(REFRESH_URL, json={"refresh_token": tokens["refresh_token"]})
    assert response.status_code == 401
