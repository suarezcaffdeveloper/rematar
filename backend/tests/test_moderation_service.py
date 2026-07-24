"""Tests de `ModerationService` (Épica 7, Módulo 7.6), llamado directamente contra
Postgres/Redis reales -- mismo criterio que el resto de la suite de tests de servicio.
"""

import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
import pytest_asyncio
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit.repository import AuditLogRepository
from app.core.config import get_settings
from app.core.exceptions import ForbiddenError, NotFoundError
from app.core.security import hash_password
from app.events.base import DomainEvent
from app.moderation.redis_state import ModerationRedisGateway
from app.moderation.repository import ModerationRepository
from app.moderation.service import ModerationService
from app.modules.chat.models import ChatMessage, ChatMessageKind
from app.modules.chat.repository import ChatMessageRepository
from app.modules.remates.lotes.repository import LoteRepository
from app.modules.remates.models import Remate, RemateCategory, RemateStatus
from app.modules.remates.repository import RemateRepository
from app.modules.remates.service import RemateService
from app.modules.users.models import User, UserRole
from app.modules.users.repository import UserRepository
from app.notifications.repository import NotificationRepository
from app.presence.service import PresenceService
from app.websocket.close_codes import KICKED
from app.websocket.manager import ConnectionContext, ConnectionManager
from app.websocket.rooms import RoomManager


class _RecordingEventBus:
    def __init__(self) -> None:
        self.events: list[DomainEvent] = []

    async def publish(self, event: DomainEvent) -> None:
        self.events.append(event)


class _FakeWebSocket:
    def __init__(self) -> None:
        self.closed_with: tuple[int, str] | None = None

    async def close(self, code: int, reason: str) -> None:
        self.closed_with = (code, reason)


@pytest_asyncio.fixture
async def redis_client():
    client = Redis.from_url(get_settings().REDIS_URL, decode_responses=True)
    yield client
    await client.flushdb()
    await client.aclose()


async def _create_user(db_session: AsyncSession, *, role: UserRole = UserRole.COMPRADOR) -> User:
    user = User(
        email=f"{uuid.uuid4()}@example.com",
        hashed_password=hash_password("password123"),
        full_name="Usuario de prueba",
        role=role,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


async def _create_remate(db_session: AsyncSession, owner: User) -> Remate:
    remate = Remate(owner_id=owner.id, title="Remate de prueba", category=RemateCategory.HACIENDA)
    db_session.add(remate)
    await db_session.commit()
    await db_session.refresh(remate)
    return remate


async def _create_message(db_session: AsyncSession, remate: Remate, author: User) -> ChatMessage:
    message = ChatMessage(
        remate_id=remate.id,
        kind=ChatMessageKind.USER,
        author_id=author.id,
        author_name=author.full_name,
        author_role=author.role.value,
        content="Anuncio importante",
    )
    db_session.add(message)
    await db_session.commit()
    await db_session.refresh(message)
    return message


def _make_service(
    db_session: AsyncSession,
    redis_client: Redis,
    event_bus: _RecordingEventBus,
    connection_manager: ConnectionManager,
    room_manager: RoomManager,
) -> ModerationService:
    remate_repository = RemateRepository(db_session)
    audit_repository = AuditLogRepository(db_session)
    remate_service = RemateService(
        remate_repository, LoteRepository(db_session), event_bus, audit_repository
    )
    presence_service = PresenceService(room_manager, connection_manager, event_bus)
    return ModerationService(
        ModerationRepository(db_session),
        ModerationRedisGateway(redis_client),
        connection_manager,
        room_manager,
        presence_service,
        remate_service,
        remate_repository,
        ChatMessageRepository(db_session),
        UserRepository(db_session),
        audit_repository,
        NotificationRepository(db_session),
        event_bus,
        get_settings(),
    )


async def _setup(db_session: AsyncSession):
    rematador = await _create_user(db_session, role=UserRole.REMATADOR)
    buyer = await _create_user(db_session)
    remate = await _create_remate(db_session, rematador)
    return rematador, buyer, remate


# --- kick_user ---------------------------------------------------------------------------


async def test_kick_user_bans_and_closes_active_connections(
    db_session: AsyncSession, redis_client: Redis
) -> None:
    rematador, buyer, remate = await _setup(db_session)
    connection_manager = ConnectionManager()
    room_manager = RoomManager()
    event_bus = _RecordingEventBus()
    service = _make_service(db_session, redis_client, event_bus, connection_manager, room_manager)

    fake_ws = _FakeWebSocket()
    connection_id = uuid.uuid4()
    await connection_manager.register(
        ConnectionContext(connection_id=connection_id, user_id=buyer.id, websocket=fake_ws)
    )
    await room_manager.join(remate.id, connection_id)

    await service.kick_user(remate.id, rematador, buyer.id, "Lenguaje inapropiado")

    assert await service.is_banned(remate.id, buyer.id) is True
    assert fake_ws.closed_with is not None
    assert fake_ws.closed_with[0] == KICKED
    assert any(event.event_type == "moderacion.usuario_expulsado" for event in event_bus.events)


async def test_kick_user_only_closes_connections_in_that_remates_room(
    db_session: AsyncSession, redis_client: Redis
) -> None:
    rematador, buyer, remate = await _setup(db_session)
    other_remate = await _create_remate(db_session, rematador)
    connection_manager = ConnectionManager()
    room_manager = RoomManager()
    event_bus = _RecordingEventBus()
    service = _make_service(db_session, redis_client, event_bus, connection_manager, room_manager)

    fake_ws = _FakeWebSocket()
    connection_id = uuid.uuid4()
    await connection_manager.register(
        ConnectionContext(connection_id=connection_id, user_id=buyer.id, websocket=fake_ws)
    )
    await room_manager.join(other_remate.id, connection_id)  # conectado a OTRO remate

    await service.kick_user(remate.id, rematador, buyer.id, None)

    assert fake_ws.closed_with is None  # no se tocó una conexión de otra sala


async def test_kick_user_forbidden_for_non_owner(
    db_session: AsyncSession, redis_client: Redis
) -> None:
    _, buyer, remate = await _setup(db_session)
    # Un remate DRAFT ajeno es 404, no 403 (RemateService._is_visible) -- se saca del
    # DRAFT para ejercitar el camino "visible pero no propio" -> ForbiddenError.
    remate.status = RemateStatus.SCHEDULED
    remate.starts_at = datetime.now(UTC) + timedelta(days=1)
    await db_session.commit()
    other_rematador = await _create_user(db_session, role=UserRole.REMATADOR)
    connection_manager = ConnectionManager()
    room_manager = RoomManager()
    event_bus = _RecordingEventBus()
    service = _make_service(db_session, redis_client, event_bus, connection_manager, room_manager)

    with pytest.raises(ForbiddenError):
        await service.kick_user(remate.id, other_rematador, buyer.id, None)


async def test_kick_user_rejects_non_comprador_target(
    db_session: AsyncSession, redis_client: Redis
) -> None:
    rematador, _, remate = await _setup(db_session)
    another_rematador = await _create_user(db_session, role=UserRole.REMATADOR)
    connection_manager = ConnectionManager()
    room_manager = RoomManager()
    event_bus = _RecordingEventBus()
    service = _make_service(db_session, redis_client, event_bus, connection_manager, room_manager)

    with pytest.raises(NotFoundError):
        await service.kick_user(remate.id, rematador, another_rematador.id, None)


# --- mute_user / lock_chat -----------------------------------------------------------------


async def test_mute_user_sets_redis_state_and_publishes_event(
    db_session: AsyncSession, redis_client: Redis
) -> None:
    rematador, buyer, remate = await _setup(db_session)
    connection_manager = ConnectionManager()
    room_manager = RoomManager()
    event_bus = _RecordingEventBus()
    service = _make_service(db_session, redis_client, event_bus, connection_manager, room_manager)

    await service.mute_user(remate.id, rematador, buyer.id, 120)

    gateway = ModerationRedisGateway(redis_client)
    assert await gateway.is_muted(remate.id, buyer.id) is True
    assert any(event.event_type == "moderacion.usuario_silenciado" for event in event_bus.events)


async def test_lock_chat_sets_redis_state_and_publishes_event(
    db_session: AsyncSession, redis_client: Redis
) -> None:
    rematador, _, remate = await _setup(db_session)
    connection_manager = ConnectionManager()
    room_manager = RoomManager()
    event_bus = _RecordingEventBus()
    service = _make_service(db_session, redis_client, event_bus, connection_manager, room_manager)

    await service.lock_chat(remate.id, rematador, 60)

    gateway = ModerationRedisGateway(redis_client)
    assert await gateway.is_chat_locked(remate.id) is True
    assert any(event.event_type == "moderacion.chat_bloqueado" for event in event_bus.events)


# --- pin / unpin ---------------------------------------------------------------------------


async def test_pin_and_unpin_message(db_session: AsyncSession, redis_client: Redis) -> None:
    rematador, buyer, remate = await _setup(db_session)
    message = await _create_message(db_session, remate, buyer)
    connection_manager = ConnectionManager()
    room_manager = RoomManager()
    event_bus = _RecordingEventBus()
    service = _make_service(db_session, redis_client, event_bus, connection_manager, room_manager)

    pin = await service.pin_message(remate.id, rematador, message.id)
    assert pin.message_id == message.id

    pinned = await service.list_pinned_messages(remate.id, rematador)
    assert [p.message_id for p in pinned] == [message.id]
    assert pinned[0].content == "Anuncio importante"

    await service.unpin_message(remate.id, rematador, message.id)
    assert await service.list_pinned_messages(remate.id, rematador) == []


async def test_pin_message_from_another_remate_is_not_found(
    db_session: AsyncSession, redis_client: Redis
) -> None:
    rematador, buyer, remate = await _setup(db_session)
    other_remate = await _create_remate(db_session, rematador)
    message = await _create_message(db_session, other_remate, buyer)
    connection_manager = ConnectionManager()
    room_manager = RoomManager()
    event_bus = _RecordingEventBus()
    service = _make_service(db_session, redis_client, event_bus, connection_manager, room_manager)

    with pytest.raises(NotFoundError):
        await service.pin_message(remate.id, rematador, message.id)


# --- list_connected_buyers -----------------------------------------------------------------


async def test_list_connected_buyers_filters_by_search_and_excludes_non_compradores(
    db_session: AsyncSession, redis_client: Redis
) -> None:
    rematador, buyer, remate = await _setup(db_session)
    connection_manager = ConnectionManager()
    room_manager = RoomManager()
    event_bus = _RecordingEventBus()
    service = _make_service(db_session, redis_client, event_bus, connection_manager, room_manager)

    buyer.full_name = "Juan Comprador"
    await db_session.commit()

    connection_id = uuid.uuid4()
    await connection_manager.register(
        ConnectionContext(connection_id=connection_id, user_id=buyer.id, websocket=_FakeWebSocket())
    )
    await room_manager.join(remate.id, connection_id)
    # El propio rematador también puede estar "conectado" a su sala -- no debe listarse.
    rematador_connection_id = uuid.uuid4()
    await connection_manager.register(
        ConnectionContext(
            connection_id=rematador_connection_id, user_id=rematador.id, websocket=_FakeWebSocket()
        )
    )
    await room_manager.join(remate.id, rematador_connection_id)

    results = await service.list_connected_buyers(remate.id, rematador, search=None)
    assert [r.user_id for r in results] == [buyer.id]

    filtered = await service.list_connected_buyers(remate.id, rematador, search="juan")
    assert len(filtered) == 1
    no_match = await service.list_connected_buyers(remate.id, rematador, search="inexistente")
    assert no_match == []


# --- record_invalid_bid_attempt -------------------------------------------------------------


async def test_invalid_bid_attempts_notify_rematador_once_past_threshold(
    db_session: AsyncSession, redis_client: Redis
) -> None:
    rematador, buyer, remate = await _setup(db_session)
    connection_manager = ConnectionManager()
    room_manager = RoomManager()
    event_bus = _RecordingEventBus()
    service = _make_service(db_session, redis_client, event_bus, connection_manager, room_manager)
    settings = get_settings()
    threshold = settings.MODERATION_INVALID_BID_THRESHOLD

    for _ in range(threshold - 1):
        await service.record_invalid_bid_attempt(
            remate_id=remate.id,
            lote_id=uuid.uuid4(),
            buyer_id=buyer.id,
            amount=str(Decimal("100")),
            reason="El monto debe ser al menos 200.",
        )
    assert event_bus.events == []  # todavía no cruzó el umbral

    await service.record_invalid_bid_attempt(
        remate_id=remate.id,
        lote_id=uuid.uuid4(),
        buyer_id=buyer.id,
        amount=str(Decimal("100")),
        reason="El monto debe ser al menos 200.",
    )

    threshold_event_type = "moderacion.umbral_ofertas_invalidas_superado"
    threshold_events = [e for e in event_bus.events if e.event_type == threshold_event_type]
    assert len(threshold_events) == 1

    notifications, total = await NotificationRepository(db_session).list_for_user(
        rematador.id, unread_only=False, offset=0, limit=10
    )
    assert total == 1

    # Un intento adicional en la misma ventana no debe volver a notificar.
    await service.record_invalid_bid_attempt(
        remate_id=remate.id,
        lote_id=uuid.uuid4(),
        buyer_id=buyer.id,
        amount=str(Decimal("100")),
        reason="El monto debe ser al menos 200.",
    )
    threshold_events_after = [e for e in event_bus.events if e.event_type == threshold_event_type]
    assert len(threshold_events_after) == 1
