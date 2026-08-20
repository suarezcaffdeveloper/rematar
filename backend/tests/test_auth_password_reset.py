"""Tests del flujo de recuperación de contraseña (RNF-11): "olvidé mi contraseña" ->
email con link firmado -> validar link -> elegir contraseña nueva -> se cierran las
sesiones activas -> email de confirmación.

Mismo criterio que `test_chat_service.py`/`test_postauction_service.py`: la mayoría de
los tests llaman a `AuthService` directamente contra Postgres y Redis reales, con un
`EmailSender` falso que registra los mensajes en vez de mandarlos -- así se puede
inspeccionar el link firmado que viajaría en el email sin necesitar SMTP real. Un test
de punta a punta (`test_full_flow_via_http_forgot_validate_reset_and_login`) ejercita el
mismo camino a través de los endpoints HTTP reales, con el mismo truco de reemplazar
`get_email_sender` por un recorder vía `app.dependency_overrides`.
"""

import uuid
from urllib.parse import parse_qs, urlparse

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.audit.repository import AuditLogRepository
from app.core.config import get_settings
from app.core.exceptions import RateLimitError, UnauthorizedError
from app.core.security import hash_password, verify_password
from app.db.session import get_db
from app.email.message import EmailMessage
from app.email.renderer import EmailTemplateRenderer
from app.events.redis_bus import RedisEventBus
from app.main import create_app
from app.modules.auth.notifications import AuthEmailNotifier
from app.modules.auth.repository import PasswordResetTokenRepository, RefreshTokenRepository
from app.modules.auth.security import TokenType, decode_and_validate
from app.modules.auth.service import AuthService
from app.modules.users.models import User, UserRole
from app.modules.users.repository import UserRepository
from app.modules.users.service import UserService
from app.notify.dependencies import get_email_sender
from app.redis.pubsub import RedisPubSub
from app.redis.rate_limit import RedisRateLimiter

FORGOT_PASSWORD_URL = "/api/v1/auth/forgot-password"
VALIDATE_RESET_URL = "/api/v1/auth/reset-password/validate"
RESET_PASSWORD_URL = "/api/v1/auth/reset-password"
LOGIN_URL = "/api/v1/auth/login"
REGISTER_URL = "/api/v1/auth/register"


class _RecordingEmailSender:
    def __init__(self) -> None:
        self.sent: list[EmailMessage] = []

    async def send(self, message: EmailMessage) -> None:
        self.sent.append(message)


def _extract_token(reset_url: str) -> str:
    return parse_qs(urlparse(reset_url).query)["token"][0]


def _extract_reset_url_from_html(html_body: str) -> str:
    # El link aparece dos veces en el template (botón + texto plano) -- alcanza con
    # encontrar la primera ocurrencia de "?token=" y recortar alrededor.
    marker = "?token="
    start = html_body.index(marker)
    end = start
    while end < len(html_body) and html_body[end] not in ('"', "<", "\n", " "):
        end += 1
    href_start = html_body.rfind("http", 0, start)
    return html_body[href_start:end]


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


@pytest_asyncio.fixture
async def redis_client():
    redis = Redis.from_url(get_settings().REDIS_URL, decode_responses=True)
    try:
        yield redis
    finally:
        await redis.flushdb()
        await redis.aclose()


def _make_service(
    db_session: AsyncSession,
    redis_client: Redis,
    *,
    email_sender: _RecordingEmailSender,
    **settings_overrides,
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
        email_notifier=AuthEmailNotifier(email_sender, EmailTemplateRenderer()),
        rate_limiter=RedisRateLimiter(redis_client),
        event_bus=event_bus,
        settings=settings,
    )


# --- request_password_reset ----------------------------------------------------------


async def test_request_password_reset_sends_email_with_signed_link(
    db_session: AsyncSession, db_engine: AsyncEngine, redis_client: Redis
) -> None:
    user = await _create_user(db_session, email="reset1@example.com")
    sender = _RecordingEmailSender()
    service = _make_service(db_session, redis_client, email_sender=sender)

    await service.request_password_reset(user.email)

    assert len(sender.sent) == 1
    message = sender.sent[0]
    assert message.to == user.email
    reset_url = _extract_reset_url_from_html(message.html_body)
    assert reset_url.startswith(get_settings().FRONTEND_URL)
    token = _extract_token(reset_url)
    # El token es válido de entrada -- lo confirma `validate_reset_token` sin lanzar.
    await service.validate_reset_token(token)


async def test_request_password_reset_does_nothing_for_unknown_email(
    db_session: AsyncSession, db_engine: AsyncEngine, redis_client: Redis
) -> None:
    sender = _RecordingEmailSender()
    service = _make_service(db_session, redis_client, email_sender=sender)

    await service.request_password_reset("nadie@example.com")

    assert sender.sent == []


async def test_request_password_reset_does_nothing_for_inactive_user(
    db_session: AsyncSession, db_engine: AsyncEngine, redis_client: Redis
) -> None:
    user = await _create_user(db_session, email="inactive@example.com", is_active=False)
    sender = _RecordingEmailSender()
    service = _make_service(db_session, redis_client, email_sender=sender)

    await service.request_password_reset(user.email)

    assert sender.sent == []


async def test_request_password_reset_invalidates_previous_link(
    db_session: AsyncSession, db_engine: AsyncEngine, redis_client: Redis
) -> None:
    user = await _create_user(db_session, email="reset2@example.com")
    sender = _RecordingEmailSender()
    service = _make_service(db_session, redis_client, email_sender=sender)

    await service.request_password_reset(user.email)
    first_token = _extract_token(_extract_reset_url_from_html(sender.sent[0].html_body))

    await service.request_password_reset(user.email)
    second_token = _extract_token(_extract_reset_url_from_html(sender.sent[1].html_body))

    try:
        await service.validate_reset_token(first_token)
        raise AssertionError("se esperaba UnauthorizedError para el link viejo")
    except UnauthorizedError:
        pass

    await service.validate_reset_token(second_token)


async def test_request_password_reset_is_rate_limited_per_email(
    db_session: AsyncSession, db_engine: AsyncEngine, redis_client: Redis
) -> None:
    user = await _create_user(db_session, email="reset3@example.com")
    sender = _RecordingEmailSender()
    service = _make_service(
        db_session,
        redis_client,
        email_sender=sender,
        PASSWORD_RESET_RATE_LIMIT_MAX_REQUESTS=2,
        PASSWORD_RESET_RATE_LIMIT_WINDOW_SECONDS=60,
    )

    await service.request_password_reset(user.email)
    await service.request_password_reset(user.email)

    try:
        await service.request_password_reset(user.email)
        raise AssertionError("se esperaba RateLimitError")
    except RateLimitError:
        pass

    # El límite se cuenta aunque el email no exista -- no filtra existencia de cuentas.
    for _ in range(2):
        await service.request_password_reset("nadie-mas@example.com")
    try:
        await service.request_password_reset("nadie-mas@example.com")
        raise AssertionError("se esperaba RateLimitError también para email inexistente")
    except RateLimitError:
        pass


# --- validate_reset_token / reset_password --------------------------------------------


async def test_validate_reset_token_rejects_garbage_token(
    db_session: AsyncSession, db_engine: AsyncEngine, redis_client: Redis
) -> None:
    service = _make_service(db_session, redis_client, email_sender=_RecordingEmailSender())

    try:
        await service.validate_reset_token("esto-no-es-un-jwt")
        raise AssertionError("se esperaba UnauthorizedError")
    except UnauthorizedError:
        pass


async def test_validate_reset_token_rejects_expired_link(
    db_session: AsyncSession, db_engine: AsyncEngine, redis_client: Redis
) -> None:
    user = await _create_user(db_session, email="expired@example.com")
    sender = _RecordingEmailSender()
    service = _make_service(
        db_session, redis_client, email_sender=sender, PASSWORD_RESET_TOKEN_EXPIRE_MINUTES=-1
    )

    await service.request_password_reset(user.email)
    token = _extract_token(_extract_reset_url_from_html(sender.sent[0].html_body))

    try:
        await service.validate_reset_token(token)
        raise AssertionError("se esperaba UnauthorizedError por token expirado")
    except UnauthorizedError:
        pass


async def test_reset_password_updates_password_and_notifies(
    db_session: AsyncSession, db_engine: AsyncEngine, redis_client: Redis
) -> None:
    user = await _create_user(db_session, email="reset4@example.com", password="oldpassword123")
    sender = _RecordingEmailSender()
    service = _make_service(db_session, redis_client, email_sender=sender)

    await service.request_password_reset(user.email)
    token = _extract_token(_extract_reset_url_from_html(sender.sent[0].html_body))

    await service.reset_password(token, "brandnewpassword123")

    refreshed = await UserRepository(db_session).get_by_id(user.id)
    assert refreshed is not None
    assert verify_password("brandnewpassword123", refreshed.hashed_password) is True
    assert verify_password("oldpassword123", refreshed.hashed_password) is False

    assert len(sender.sent) == 2
    confirmation = sender.sent[1]
    assert confirmation.to == user.email
    assert "actualizada" in confirmation.subject.lower()


async def test_reset_password_token_is_single_use(
    db_session: AsyncSession, db_engine: AsyncEngine, redis_client: Redis
) -> None:
    user = await _create_user(db_session, email="reset5@example.com")
    sender = _RecordingEmailSender()
    service = _make_service(db_session, redis_client, email_sender=sender)

    await service.request_password_reset(user.email)
    token = _extract_token(_extract_reset_url_from_html(sender.sent[0].html_body))

    await service.reset_password(token, "brandnewpassword123")

    try:
        await service.reset_password(token, "anotherpassword123")
        raise AssertionError("se esperaba UnauthorizedError al reusar el token")
    except UnauthorizedError:
        pass


async def test_reset_password_revokes_all_active_sessions(
    db_session: AsyncSession, db_engine: AsyncEngine, redis_client: Redis
) -> None:
    user = await _create_user(db_session, email="reset6@example.com")
    sender = _RecordingEmailSender()
    service = _make_service(db_session, redis_client, email_sender=sender)

    tokens = await service.issue_tokens(user)
    settings = get_settings()
    refresh_payload = decode_and_validate(
        tokens.refresh_token, expected_type=TokenType.REFRESH, settings=settings
    )
    refresh_token_id = uuid.UUID(refresh_payload["jti"])

    await service.request_password_reset(user.email)
    reset_token = _extract_token(_extract_reset_url_from_html(sender.sent[0].html_body))
    await service.reset_password(reset_token, "brandnewpassword123")

    stored_refresh = await RefreshTokenRepository(db_session).get_by_id(refresh_token_id)
    assert stored_refresh is not None
    assert stored_refresh.revoked_at is not None


# --- integración HTTP de punta a punta -------------------------------------------------


@pytest_asyncio.fixture
async def client_with_email_recorder(db_engine: AsyncEngine):
    """Mismo `client` de `conftest.py`, pero reemplazando `get_email_sender` por un
    recorder -- necesario para poder leer, en el test, el link firmado que viajaría
    dentro del email real."""
    session_factory = async_sessionmaker(bind=db_engine, expire_on_commit=False)

    async def _override_get_db():
        async with session_factory() as session:
            yield session

    recorder = _RecordingEmailSender()

    app = create_app()
    app.dependency_overrides[get_db] = _override_get_db
    app.dependency_overrides[get_email_sender] = lambda: recorder
    app.state.db_session_factory = session_factory

    async with app.router.lifespan_context(app):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            yield ac, recorder

    app.dependency_overrides.clear()


async def test_full_flow_via_http_forgot_validate_reset_and_login(
    client_with_email_recorder: tuple[AsyncClient, _RecordingEmailSender],
) -> None:
    client, recorder = client_with_email_recorder
    email = "fullflow@example.com"
    register_response = await client.post(
        REGISTER_URL,
        json={
            "email": email,
            "password": "password123",
            "confirm_password": "password123",
            "full_name": "Full Flow",
            "phone": "+5491122334455",
            "role": "comprador",
        },
    )
    assert register_response.status_code == 201, register_response.text

    forgot_response = await client.post(FORGOT_PASSWORD_URL, json={"email": email})
    assert forgot_response.status_code == 204

    assert len(recorder.sent) == 1
    token = _extract_token(_extract_reset_url_from_html(recorder.sent[0].html_body))

    validate_response = await client.post(VALIDATE_RESET_URL, json={"token": token})
    assert validate_response.status_code == 204

    reset_response = await client.post(
        RESET_PASSWORD_URL,
        json={
            "token": token,
            "new_password": "brandnewpassword123",
            "confirm_new_password": "brandnewpassword123",
        },
    )
    assert reset_response.status_code == 204
    assert len(recorder.sent) == 2

    old_password_login = await client.post(
        LOGIN_URL, data={"username": email, "password": "password123"}
    )
    assert old_password_login.status_code == 401

    new_password_login = await client.post(
        LOGIN_URL, data={"username": email, "password": "brandnewpassword123"}
    )
    assert new_password_login.status_code == 200


async def test_forgot_password_returns_generic_response_for_unknown_email(
    client_with_email_recorder: tuple[AsyncClient, _RecordingEmailSender],
) -> None:
    client, recorder = client_with_email_recorder

    response = await client.post(FORGOT_PASSWORD_URL, json={"email": "nadie@example.com"})

    assert response.status_code == 204
    assert recorder.sent == []


async def test_reset_password_rejects_mismatched_confirmation(
    client_with_email_recorder: tuple[AsyncClient, _RecordingEmailSender],
) -> None:
    client, _recorder = client_with_email_recorder

    response = await client.post(
        RESET_PASSWORD_URL,
        json={
            "token": "cualquier-cosa",
            "new_password": "brandnewpassword123",
            "confirm_new_password": "otra-distinta-123",
        },
    )

    assert response.status_code == 422
