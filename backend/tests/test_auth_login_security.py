"""Tests de Fase 7 (WebSocket Security Audit -- HTTP Authentication & Session Security):
login, fuerza bruta, enumeración de usuarios y cuentas suspendidas.

Mismo patrón que `test_auth_password_reset.py`: `AuthService` se construye a mano contra
Postgres y Redis reales (`db_session`/`redis_client`), con un `EmailSender` falso -- acá
no hace falta inspeccionar ningún email, pero `AuthService` igual requiere el notifier.
"""

from unittest.mock import patch

import pytest_asyncio
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from app.audit.repository import AuditLogRepository
from app.core.config import get_settings
from app.core.exceptions import RateLimitError, UnauthorizedError
from app.core.security import hash_password
from app.email.message import EmailMessage
from app.email.renderer import EmailTemplateRenderer
from app.events.redis_bus import RedisEventBus
from app.modules.auth.notifications import AuthEmailNotifier
from app.modules.auth.repository import PasswordResetTokenRepository, RefreshTokenRepository
from app.modules.auth.service import AuthService
from app.modules.users.models import User, UserRole
from app.modules.users.repository import UserRepository
from app.modules.users.service import UserService
from app.redis.pubsub import RedisPubSub
from app.redis.rate_limit import RedisRateLimiter

LOGIN_URL = "/api/v1/auth/login"


class _RecordingEmailSender:
    def __init__(self) -> None:
        self.sent: list[EmailMessage] = []

    async def send(self, message: EmailMessage) -> None:
        self.sent.append(message)


@pytest_asyncio.fixture
async def redis_client():
    redis = Redis.from_url(get_settings().REDIS_URL, decode_responses=True)
    try:
        yield redis
    finally:
        await redis.flushdb()
        await redis.aclose()


def _make_service(
    db_session: AsyncSession, redis_client: Redis, **settings_overrides
) -> AuthService:
    user_repository = UserRepository(db_session)
    settings = get_settings().model_copy(update=settings_overrides)
    event_bus = RedisEventBus(RedisPubSub(redis_client))
    return AuthService(
        user_repository=user_repository,
        user_service=UserService(user_repository, event_bus),
        refresh_token_repository=RefreshTokenRepository(db_session),
        password_reset_token_repository=PasswordResetTokenRepository(db_session),
        audit_repository=AuditLogRepository(db_session),
        email_notifier=AuthEmailNotifier(_RecordingEmailSender(), EmailTemplateRenderer()),
        rate_limiter=RedisRateLimiter(redis_client),
        event_bus=event_bus,
        settings=settings,
    )


async def _create_user(
    db_session: AsyncSession,
    *,
    email: str,
    password: str = "password123",
    is_active: bool = True,
) -> User:
    user = User(
        email=email,
        hashed_password=hash_password(password),
        full_name=email.split("@")[0],
        phone="+5491122334455",
        role=UserRole.COMPRADOR,
        is_active=is_active,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


# --- usuario inexistente / contraseña incorrecta / mensajes uniformes ----------------


async def test_login_rejects_unknown_email(
    db_session: AsyncSession, db_engine: AsyncEngine, redis_client: Redis
) -> None:
    service = _make_service(db_session, redis_client)

    try:
        await service.authenticate("nadie@example.com", "cualquier-cosa")
        raise AssertionError("se esperaba UnauthorizedError")
    except UnauthorizedError as exc:
        assert exc.message == "Email o contraseña incorrectos."


async def test_login_rejects_wrong_password_with_same_message_as_unknown_email(
    db_session: AsyncSession, db_engine: AsyncEngine, redis_client: Redis
) -> None:
    user = await _create_user(db_session, email="wrongpass@example.com")
    service = _make_service(db_session, redis_client)

    try:
        await service.authenticate(user.email, "not-the-password")
        raise AssertionError("se esperaba UnauthorizedError")
    except UnauthorizedError as exc:
        assert exc.message == "Email o contraseña incorrectos."


async def test_login_succeeds_for_correct_credentials(
    db_session: AsyncSession, db_engine: AsyncEngine, redis_client: Redis
) -> None:
    user = await _create_user(db_session, email="correct@example.com", password="password123")
    service = _make_service(db_session, redis_client)

    authenticated = await service.authenticate(user.email, "password123")
    assert authenticated.id == user.id


# --- usuario suspendido ----------------------------------------------------------------


async def test_login_rejects_suspended_user_even_with_correct_password(
    db_session: AsyncSession, db_engine: AsyncEngine, redis_client: Redis
) -> None:
    user = await _create_user(
        db_session, email="suspended@example.com", password="password123", is_active=False
    )
    service = _make_service(db_session, redis_client)

    try:
        await service.authenticate(user.email, "password123")
        raise AssertionError("se esperaba UnauthorizedError")
    except UnauthorizedError as exc:
        assert exc.message == "La cuenta está suspendida."


async def test_login_rejects_suspended_user_with_wrong_password_using_generic_message(
    db_session: AsyncSession, db_engine: AsyncEngine, redis_client: Redis
) -> None:
    """Con contraseña incorrecta, una cuenta suspendida debe dar el mismo error genérico
    que cualquier otra -- solo se distingue "suspendida" cuando ya se demostró conocer la
    contraseña correcta (ver `AuthService.authenticate`)."""
    user = await _create_user(
        db_session, email="suspended2@example.com", password="password123", is_active=False
    )
    service = _make_service(db_session, redis_client)

    try:
        await service.authenticate(user.email, "wrong-password")
        raise AssertionError("se esperaba UnauthorizedError")
    except UnauthorizedError as exc:
        assert exc.message == "Email o contraseña incorrectos."


# --- fuerza bruta ------------------------------------------------------------------------


async def test_login_is_rate_limited_per_email(
    db_session: AsyncSession, db_engine: AsyncEngine, redis_client: Redis
) -> None:
    user = await _create_user(db_session, email="bruteforce@example.com", password="password123")
    service = _make_service(
        db_session, redis_client, LOGIN_RATE_LIMIT_MAX_ATTEMPTS=3, LOGIN_RATE_LIMIT_WINDOW_SECONDS=60
    )

    for _ in range(3):
        try:
            await service.authenticate(user.email, "wrong-password")
            raise AssertionError("se esperaba UnauthorizedError")
        except UnauthorizedError:
            pass

    try:
        await service.authenticate(user.email, "wrong-password")
        raise AssertionError("se esperaba RateLimitError tras superar el límite")
    except RateLimitError:
        pass

    # Ni siquiera la contraseña correcta pasa una vez agotado el límite -- el rate limit
    # se cuenta antes de verificar la contraseña.
    try:
        await service.authenticate(user.email, "password123")
        raise AssertionError("se esperaba RateLimitError incluso con la contraseña correcta")
    except RateLimitError:
        pass


async def test_login_rate_limit_counts_attempts_against_unknown_email_too(
    db_session: AsyncSession, db_engine: AsyncEngine, redis_client: Redis
) -> None:
    """Mismo criterio que `PASSWORD_RESET_RATE_LIMIT_*` (ver
    `test_request_password_reset_is_rate_limited_per_email`): el límite se cuenta exista
    o no la cuenta, para que ni siquiera el momento en que se dispara el 429 filtre
    existencia de cuentas."""
    service = _make_service(
        db_session, redis_client, LOGIN_RATE_LIMIT_MAX_ATTEMPTS=2, LOGIN_RATE_LIMIT_WINDOW_SECONDS=60
    )

    for _ in range(2):
        try:
            await service.authenticate("nadie-tampoco@example.com", "cualquier-cosa")
            raise AssertionError("se esperaba UnauthorizedError")
        except UnauthorizedError:
            pass

    try:
        await service.authenticate("nadie-tampoco@example.com", "cualquier-cosa")
        raise AssertionError("se esperaba RateLimitError")
    except RateLimitError:
        pass


async def test_login_rate_limit_is_scoped_per_email(
    db_session: AsyncSession, db_engine: AsyncEngine, redis_client: Redis
) -> None:
    """Agotar el límite de un email no debe afectar el login de otro -- cada key del
    rate limiter está scopeada por email normalizado."""
    user_a = await _create_user(db_session, email="scoped-a@example.com", password="password123")
    user_b = await _create_user(db_session, email="scoped-b@example.com", password="password123")
    service = _make_service(
        db_session, redis_client, LOGIN_RATE_LIMIT_MAX_ATTEMPTS=1, LOGIN_RATE_LIMIT_WINDOW_SECONDS=60
    )

    await service.authenticate(user_a.email, "password123")
    try:
        await service.authenticate(user_a.email, "password123")
        raise AssertionError("se esperaba RateLimitError para user_a")
    except RateLimitError:
        pass

    # user_b no se vio afectado por el consumo del límite de user_a.
    authenticated_b = await service.authenticate(user_b.email, "password123")
    assert authenticated_b.id == user_b.id


# --- mitigación de enumeración por timing ------------------------------------------------


async def test_login_pays_password_verification_cost_even_for_unknown_email(
    db_session: AsyncSession, db_engine: AsyncEngine, redis_client: Redis
) -> None:
    """Test de caja blanca (no de timing real, que sería flaky): confirma que
    `verify_password` se invoca también cuando el email no existe -- es lo que evita que
    un email inexistente responda más rápido que uno real (enumeración por timing, ver
    Fase 7 del audit)."""
    service = _make_service(db_session, redis_client)

    with patch("app.modules.auth.service.verify_password") as mock_verify:
        mock_verify.return_value = False
        try:
            await service.authenticate("no-existe-nadie@example.com", "cualquier-cosa")
        except UnauthorizedError:
            pass

    assert mock_verify.call_count == 1
