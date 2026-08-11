"""Tests de `ChatService` (Épica 6, Módulo 6.4), llamado directamente (sin pasar por
HTTP) contra la base y Redis reales -- mismo criterio que `test_snapshot_service.py`:
el estado de dominio (remates) se arma vía HTTP porque es menos código que insertar
cada fila a mano; lo que se testea acá es `ChatService` en sí.

Los tests de integración a través del endpoint HTTP están en `test_chat_router.py`; los
de los mensajes de sistema (`ChatSystemEventDispatcher`) en
`test_chat_realtime_system_messages.py`.
"""

import uuid

import pytest_asyncio
from httpx import AsyncClient
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.audit.repository import AuditLogRepository
from app.core.config import get_settings
from app.core.exceptions import BusinessRuleError, ForbiddenError, NotFoundError, RateLimitError
from app.events.base import DomainEvent
from app.modules.chat.events import ChatMessageDeleted, ChatMessageSent
from app.modules.chat.models import ChatMessageKind
from app.modules.chat.repository import ChatMessageRepository
from app.modules.chat.schemas import ChatMessageCreate
from app.modules.chat.service import ChatService
from app.modules.remates.lotes.repository import LoteRepository
from app.modules.remates.repository import RemateRepository
from app.modules.remates.service import RemateService
from app.modules.users.models import User
from app.redis.rate_limit import RedisRateLimiter

REGISTER_URL = "/api/v1/auth/register"
LOGIN_URL = "/api/v1/auth/login"
REMATES_URL = "/api/v1/remates"


class _RecordingEventBus:
    def __init__(self) -> None:
        self.published: list[DomainEvent] = []

    async def publish(self, event: DomainEvent) -> None:
        self.published.append(event)


@pytest_asyncio.fixture
async def redis_client():
    redis = Redis.from_url(get_settings().REDIS_URL, decode_responses=True)
    try:
        yield redis
    finally:
        await redis.flushdb()
        await redis.aclose()


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def _register_and_login(client: AsyncClient, *, email: str, role: str) -> tuple[str, str]:
    payload = {
        "email": email,
        "password": "password123",
        "confirm_password": "password123",
        "full_name": "Test User",
        "phone": "+5491122334455",
        "role": role,
    }
    register = await client.post(REGISTER_URL, json=payload)
    login = await client.post(LOGIN_URL, data={"username": email, "password": "password123"})
    assert login.status_code == 200, login.text
    return register.json()["id"], login.json()["access_token"]


async def _owner(client: AsyncClient, email: str) -> tuple[str, str]:
    return await _register_and_login(client, email=email, role="rematador")


async def _buyer(client: AsyncClient, email: str) -> tuple[str, str]:
    return await _register_and_login(client, email=email, role="comprador")


async def _create_and_schedule_remate(client: AsyncClient, token: str) -> dict:
    payload = {
        "title": "Remate de verificación de chat",
        "category": "hacienda",
        "starts_at": "2027-06-01T10:00:00Z",
    }
    r = await client.post(REMATES_URL, json=payload, headers=_auth(token))
    assert r.status_code == 201, r.text
    remate = r.json()
    schedule = await client.post(f"{REMATES_URL}/{remate['id']}/schedule", headers=_auth(token))
    assert schedule.status_code == 200, schedule.text
    return remate


async def _fetch_user(db_engine: AsyncEngine, user_id: str) -> User:
    session_factory = async_sessionmaker(bind=db_engine, expire_on_commit=False)
    async with session_factory() as session:
        user = await session.get(User, user_id)
        assert user is not None
        return user


def _make_service(
    db_session: AsyncSession,
    redis_client: Redis,
    *,
    event_bus: _RecordingEventBus,
    **settings_overrides,
) -> ChatService:
    audit_repository = AuditLogRepository(db_session)
    remate_service = RemateService(
        RemateRepository(db_session), LoteRepository(db_session), event_bus, audit_repository
    )
    settings = get_settings().model_copy(update=settings_overrides)
    return ChatService(
        ChatMessageRepository(db_session),
        remate_service,
        event_bus,
        RedisRateLimiter(redis_client),
        settings,
        audit_repository,
    )


# --- send_message -------------------------------------------------------------------


async def test_send_message_persists_and_denormalizes_author_fields(
    client: AsyncClient, db_session: AsyncSession, db_engine: AsyncEngine, redis_client: Redis
) -> None:
    owner_id, owner_token = await _owner(client, "chatsvc1-owner@example.com")
    remate = await _create_and_schedule_remate(client, owner_token)
    owner = await _fetch_user(db_engine, owner_id)

    event_bus = _RecordingEventBus()
    service = _make_service(db_session, redis_client, event_bus=event_bus)

    message = await service.send_message(
        uuid.UUID(remate["id"]), owner, ChatMessageCreate(content="Hola a todos")
    )

    assert message.kind == ChatMessageKind.USER
    assert message.author_id == owner.id
    assert message.author_name == owner.full_name
    assert message.author_role == "rematador"
    assert message.content == "Hola a todos"

    sent_events = [e for e in event_bus.published if isinstance(e, ChatMessageSent)]
    assert len(sent_events) == 1
    assert sent_events[0].message_id == message.id
    assert sent_events[0].content == "Hola a todos"


async def test_send_message_strips_whitespace_via_schema(
    client: AsyncClient, db_session: AsyncSession, db_engine: AsyncEngine, redis_client: Redis
) -> None:
    owner_id, owner_token = await _owner(client, "chatsvc2-owner@example.com")
    remate = await _create_and_schedule_remate(client, owner_token)
    owner = await _fetch_user(db_engine, owner_id)
    service = _make_service(db_session, redis_client, event_bus=_RecordingEventBus())

    message = await service.send_message(
        uuid.UUID(remate["id"]), owner, ChatMessageCreate(content="  hola  ")
    )

    assert message.content == "hola"


async def test_send_message_rejects_blank_content_at_schema_level() -> None:
    try:
        ChatMessageCreate(content="   ")
        raise AssertionError("se esperaba un ValueError")
    except ValueError:
        pass


async def test_send_message_rejects_content_over_the_configured_max_length(
    client: AsyncClient, db_session: AsyncSession, db_engine: AsyncEngine, redis_client: Redis
) -> None:
    owner_id, owner_token = await _owner(client, "chatsvc3-owner@example.com")
    remate = await _create_and_schedule_remate(client, owner_token)
    owner = await _fetch_user(db_engine, owner_id)
    service = _make_service(
        db_session, redis_client, event_bus=_RecordingEventBus(), CHAT_MESSAGE_MAX_LENGTH=10
    )

    try:
        await service.send_message(
            uuid.UUID(remate["id"]),
            owner,
            ChatMessageCreate(content="esto tiene mas de diez caracteres"),
        )
        raise AssertionError("se esperaba BusinessRuleError")
    except BusinessRuleError:
        pass


async def test_send_message_enforces_rate_limit(
    client: AsyncClient, db_session: AsyncSession, db_engine: AsyncEngine, redis_client: Redis
) -> None:
    owner_id, owner_token = await _owner(client, "chatsvc4-owner@example.com")
    remate = await _create_and_schedule_remate(client, owner_token)
    owner = await _fetch_user(db_engine, owner_id)
    service = _make_service(
        db_session,
        redis_client,
        event_bus=_RecordingEventBus(),
        CHAT_RATE_LIMIT_MAX_MESSAGES=2,
        CHAT_RATE_LIMIT_WINDOW_SECONDS=10,
    )
    remate_id = uuid.UUID(remate["id"])

    await service.send_message(remate_id, owner, ChatMessageCreate(content="uno"))
    await service.send_message(remate_id, owner, ChatMessageCreate(content="dos"))

    try:
        await service.send_message(remate_id, owner, ChatMessageCreate(content="tres"))
        raise AssertionError("se esperaba RateLimitError")
    except RateLimitError:
        pass


async def test_send_message_to_a_draft_remate_from_a_stranger_raises_not_found(
    client: AsyncClient, db_session: AsyncSession, db_engine: AsyncEngine, redis_client: Redis
) -> None:
    owner_token_pair = await _owner(client, "chatsvc5-owner@example.com")
    owner_token = owner_token_pair[1]
    payload = {
        "title": "Remate en borrador",
        "category": "hacienda",
        "starts_at": "2027-06-01T10:00:00Z",
    }
    r = await client.post(REMATES_URL, json=payload, headers=_auth(owner_token))
    remate_id = uuid.UUID(r.json()["id"])

    stranger_id, _ = await _buyer(client, "chatsvc5-stranger@example.com")
    stranger = await _fetch_user(db_engine, stranger_id)
    service = _make_service(db_session, redis_client, event_bus=_RecordingEventBus())

    try:
        await service.send_message(remate_id, stranger, ChatMessageCreate(content="hola"))
        raise AssertionError("se esperaba NotFoundError")
    except NotFoundError:
        pass


# --- delete_message ------------------------------------------------------------------


async def test_delete_message_by_owner_soft_deletes_and_publishes(
    client: AsyncClient, db_session: AsyncSession, db_engine: AsyncEngine, redis_client: Redis
) -> None:
    owner_id, owner_token = await _owner(client, "chatsvc6-owner@example.com")
    remate = await _create_and_schedule_remate(client, owner_token)
    owner = await _fetch_user(db_engine, owner_id)
    event_bus = _RecordingEventBus()
    service = _make_service(db_session, redis_client, event_bus=event_bus)
    remate_id = uuid.UUID(remate["id"])

    message = await service.send_message(remate_id, owner, ChatMessageCreate(content="borrame"))
    deleted = await service.delete_message(remate_id, message.id, owner)

    assert deleted.is_deleted is True
    assert deleted.deleted_by == owner.id
    deleted_events = [e for e in event_bus.published if isinstance(e, ChatMessageDeleted)]
    assert len(deleted_events) == 1
    assert deleted_events[0].message_id == message.id


async def test_delete_message_by_non_owner_is_forbidden(
    client: AsyncClient, db_session: AsyncSession, db_engine: AsyncEngine, redis_client: Redis
) -> None:
    owner_id, owner_token = await _owner(client, "chatsvc7-owner@example.com")
    remate = await _create_and_schedule_remate(client, owner_token)
    owner = await _fetch_user(db_engine, owner_id)
    buyer_id, _ = await _buyer(client, "chatsvc7-buyer@example.com")
    buyer = await _fetch_user(db_engine, buyer_id)
    event_bus = _RecordingEventBus()
    service = _make_service(db_session, redis_client, event_bus=event_bus)
    remate_id = uuid.UUID(remate["id"])

    message = await service.send_message(remate_id, owner, ChatMessageCreate(content="hola"))

    try:
        await service.delete_message(remate_id, message.id, buyer)
        raise AssertionError("se esperaba ForbiddenError")
    except ForbiddenError:
        pass


async def test_deleting_an_already_deleted_message_is_idempotent(
    client: AsyncClient, db_session: AsyncSession, db_engine: AsyncEngine, redis_client: Redis
) -> None:
    owner_id, owner_token = await _owner(client, "chatsvc8-owner@example.com")
    remate = await _create_and_schedule_remate(client, owner_token)
    owner = await _fetch_user(db_engine, owner_id)
    event_bus = _RecordingEventBus()
    service = _make_service(db_session, redis_client, event_bus=event_bus)
    remate_id = uuid.UUID(remate["id"])

    message = await service.send_message(remate_id, owner, ChatMessageCreate(content="hola"))
    await service.delete_message(remate_id, message.id, owner)
    await service.delete_message(remate_id, message.id, owner)

    deleted_events = [e for e in event_bus.published if isinstance(e, ChatMessageDeleted)]
    assert len(deleted_events) == 1  # sin segunda publicación


async def test_delete_message_not_in_that_remate_raises_not_found(
    client: AsyncClient, db_session: AsyncSession, db_engine: AsyncEngine, redis_client: Redis
) -> None:
    owner_id, owner_token = await _owner(client, "chatsvc9-owner@example.com")
    remate_a = await _create_and_schedule_remate(client, owner_token)
    remate_b = await _create_and_schedule_remate(client, owner_token)
    owner = await _fetch_user(db_engine, owner_id)
    service = _make_service(db_session, redis_client, event_bus=_RecordingEventBus())

    message = await service.send_message(
        uuid.UUID(remate_a["id"]), owner, ChatMessageCreate(content="hola")
    )

    try:
        await service.delete_message(uuid.UUID(remate_b["id"]), message.id, owner)
        raise AssertionError("se esperaba NotFoundError")
    except NotFoundError:
        pass


# --- record_system_message ------------------------------------------------------------


async def test_record_system_message_is_idempotent_by_source_event_id(
    client: AsyncClient, db_session: AsyncSession, db_engine: AsyncEngine, redis_client: Redis
) -> None:
    owner_id, owner_token = await _owner(client, "chatsvc10-owner@example.com")
    remate = await _create_and_schedule_remate(client, owner_token)
    event_bus = _RecordingEventBus()
    service = _make_service(db_session, redis_client, event_bus=event_bus)
    remate_id = uuid.UUID(remate["id"])
    source_event_id = uuid.uuid4()

    first = await service.record_system_message(
        remate_id,
        "El remate comenzó.",
        system_event_type="remate.started",
        source_event_id=source_event_id,
    )
    second = await service.record_system_message(
        remate_id,
        "El remate comenzó.",
        system_event_type="remate.started",
        source_event_id=source_event_id,
    )

    assert first is not None
    assert second is not None
    assert first.id == second.id
    sent_events = [e for e in event_bus.published if isinstance(e, ChatMessageSent)]
    assert len(sent_events) == 1  # segunda llamada no vuelve a publicar


async def test_record_system_message_has_no_author(
    client: AsyncClient, db_session: AsyncSession, db_engine: AsyncEngine, redis_client: Redis
) -> None:
    owner_id, owner_token = await _owner(client, "chatsvc11-owner@example.com")
    remate = await _create_and_schedule_remate(client, owner_token)
    service = _make_service(db_session, redis_client, event_bus=_RecordingEventBus())

    message = await service.record_system_message(
        uuid.UUID(remate["id"]),
        "Se abrió el lote 1.",
        system_event_type="lote.opened",
        source_event_id=uuid.uuid4(),
    )

    assert message is not None
    assert message.kind == ChatMessageKind.SYSTEM
    assert message.author_id is None
    assert message.author_name is None
    assert message.author_role is None


# --- notify_typing ---------------------------------------------------------------------


async def test_notify_typing_publishes_without_persisting(
    client: AsyncClient, db_session: AsyncSession, db_engine: AsyncEngine, redis_client: Redis
) -> None:
    owner_id, owner_token = await _owner(client, "chatsvc12-owner@example.com")
    remate = await _create_and_schedule_remate(client, owner_token)
    owner = await _fetch_user(db_engine, owner_id)
    event_bus = _RecordingEventBus()
    service = _make_service(db_session, redis_client, event_bus=event_bus)
    remate_id = uuid.UUID(remate["id"])

    await service.notify_typing(remate_id, owner)

    assert len(event_bus.published) == 1
    recent = await service.list_recent(remate_id, owner)
    assert recent == []  # nada persistido


async def test_notify_typing_is_rate_limited_silently(
    client: AsyncClient, db_session: AsyncSession, db_engine: AsyncEngine, redis_client: Redis
) -> None:
    owner_id, owner_token = await _owner(client, "chatsvc13-owner@example.com")
    remate = await _create_and_schedule_remate(client, owner_token)
    owner = await _fetch_user(db_engine, owner_id)
    event_bus = _RecordingEventBus()
    service = _make_service(
        db_session, redis_client, event_bus=event_bus, CHAT_TYPING_RATE_LIMIT_WINDOW_SECONDS=10
    )
    remate_id = uuid.UUID(remate["id"])

    await service.notify_typing(remate_id, owner)
    await service.notify_typing(remate_id, owner)  # dentro de la ventana, se descarta

    assert len(event_bus.published) == 1  # sin excepción, solo no publica de nuevo


# --- list_recent / list_before ----------------------------------------------------------


async def test_list_recent_returns_messages_in_chronological_order(
    client: AsyncClient, db_session: AsyncSession, db_engine: AsyncEngine, redis_client: Redis
) -> None:
    owner_id, owner_token = await _owner(client, "chatsvc14-owner@example.com")
    remate = await _create_and_schedule_remate(client, owner_token)
    owner = await _fetch_user(db_engine, owner_id)
    service = _make_service(db_session, redis_client, event_bus=_RecordingEventBus())
    remate_id = uuid.UUID(remate["id"])

    await service.send_message(remate_id, owner, ChatMessageCreate(content="primero"))
    await service.send_message(remate_id, owner, ChatMessageCreate(content="segundo"))

    recent = await service.list_recent(remate_id, owner)

    assert [m.content for m in recent] == ["primero", "segundo"]
