"""Tests unitarios de `PresenceService` (Épica 6, Módulo 6.2), en aislamiento total --
`RoomManager`/`ConnectionManager` reales (sin I/O, igual que `test_room_manager.py`) y
un `EventBus` fake local que registra lo publicado, mismo criterio que `_NoOpEventBus`
en `test_snapshot_service.py`. Los tests de integración de punta a punta (Redis real,
Gateway real) están en `test_websocket_gateway.py` y `test_realtime_sync.py`.
"""

import uuid

from app.events.base import DomainEvent
from app.presence.service import PresenceService
from app.websocket.manager import ConnectionContext, ConnectionManager
from app.websocket.rooms import RoomManager


class _RecordingEventBus:
    def __init__(self) -> None:
        self.published: list[DomainEvent] = []

    async def publish(self, event: DomainEvent) -> None:
        self.published.append(event)


def _uuid() -> uuid.UUID:
    return uuid.uuid4()


async def _register_connection(
    connection_manager: ConnectionManager, *, user_id: uuid.UUID
) -> uuid.UUID:
    context = ConnectionContext(connection_id=_uuid(), user_id=user_id, websocket=None)  # type: ignore[arg-type]
    await connection_manager.register(context)
    return context.connection_id


def _make_service() -> tuple[PresenceService, RoomManager, ConnectionManager, _RecordingEventBus]:
    room_manager = RoomManager()
    connection_manager = ConnectionManager()
    event_bus = _RecordingEventBus()
    service = PresenceService(room_manager, connection_manager, event_bus)
    return service, room_manager, connection_manager, event_bus


# --- join_room ---------------------------------------------------------------------------


async def test_join_room_publishes_presence_connected_with_correct_count() -> None:
    service, _room_manager, connection_manager, event_bus = _make_service()
    remate_id, user_id = _uuid(), _uuid()
    connection_id = await _register_connection(connection_manager, user_id=user_id)

    joined = await service.join_room(remate_id, connection_id, user_id)

    assert joined is True
    assert len(event_bus.published) == 1
    event = event_bus.published[0]
    assert event.event_type == "presencia.usuario_conectado"
    assert event.remate_id == remate_id
    assert event.connection_id == connection_id
    assert event.user_id == user_id
    assert event.connected_users == 1


async def test_join_room_idempotent_rejoin_does_not_publish_again() -> None:
    service, _room_manager, connection_manager, event_bus = _make_service()
    remate_id, user_id = _uuid(), _uuid()
    connection_id = await _register_connection(connection_manager, user_id=user_id)
    await service.join_room(remate_id, connection_id, user_id)

    joined_again = await service.join_room(remate_id, connection_id, user_id)

    assert joined_again is True
    assert len(event_bus.published) == 1  # sin segunda publicación


async def test_join_room_rejected_when_connection_in_another_room_does_not_publish() -> None:
    service, _room_manager, connection_manager, event_bus = _make_service()
    room_a, room_b, user_id = _uuid(), _uuid(), _uuid()
    connection_id = await _register_connection(connection_manager, user_id=user_id)
    await service.join_room(room_a, connection_id, user_id)

    joined = await service.join_room(room_b, connection_id, user_id)

    assert joined is False
    assert len(event_bus.published) == 1  # solo el join original a room_a


async def test_join_room_reflects_multiple_connections_in_the_count() -> None:
    service, _room_manager, connection_manager, event_bus = _make_service()
    remate_id = _uuid()
    user_a, user_b = _uuid(), _uuid()
    conn_a = await _register_connection(connection_manager, user_id=user_a)
    conn_b = await _register_connection(connection_manager, user_id=user_b)

    await service.join_room(remate_id, conn_a, user_a)
    await service.join_room(remate_id, conn_b, user_b)

    assert event_bus.published[0].connected_users == 1
    assert event_bus.published[1].connected_users == 2


# --- leave_room ---------------------------------------------------------------------------


async def test_leave_room_publishes_presence_disconnected_with_post_leave_count() -> None:
    service, _room_manager, connection_manager, event_bus = _make_service()
    remate_id = _uuid()
    user_a, user_b = _uuid(), _uuid()
    conn_a = await _register_connection(connection_manager, user_id=user_a)
    conn_b = await _register_connection(connection_manager, user_id=user_b)
    await service.join_room(remate_id, conn_a, user_a)
    await service.join_room(remate_id, conn_b, user_b)

    left_room_id = await service.leave_room(conn_a, user_a)

    assert left_room_id == remate_id
    disconnected_events = [
        e for e in event_bus.published if e.event_type == "presencia.usuario_desconectado"
    ]
    assert len(disconnected_events) == 1
    event = disconnected_events[0]
    assert event.connection_id == conn_a
    assert event.user_id == user_a
    assert event.connected_users == 1  # solo conn_b sigue en la sala


async def test_leave_room_without_prior_join_does_not_publish() -> None:
    service, _room_manager, connection_manager, event_bus = _make_service()
    user_id = _uuid()
    connection_id = await _register_connection(connection_manager, user_id=user_id)

    result = await service.leave_room(connection_id, user_id)

    assert result is None
    assert event_bus.published == []


# --- connected_users_summary (caso multi-pestaña, mismo user_id) --------------------------


async def test_connected_users_summary_distinguishes_two_connections_of_the_same_user() -> None:
    service, _room_manager, connection_manager, _event_bus = _make_service()
    remate_id, user_id = _uuid(), _uuid()
    tab_1 = await _register_connection(connection_manager, user_id=user_id)
    tab_2 = await _register_connection(connection_manager, user_id=user_id)
    await service.join_room(remate_id, tab_1, user_id)
    await service.join_room(remate_id, tab_2, user_id)

    summary = service.connected_users_summary(remate_id)

    assert len(summary) == 2
    assert {entry.connection_id for entry in summary} == {tab_1, tab_2}
    assert all(entry.user_id == user_id for entry in summary)


async def test_connected_users_summary_skips_connections_no_longer_registered() -> None:
    service, room_manager, connection_manager, _event_bus = _make_service()
    remate_id, user_id = _uuid(), _uuid()
    connection_id = await _register_connection(connection_manager, user_id=user_id)
    await service.join_room(remate_id, connection_id, user_id)
    # La conexión se dio de baja en ConnectionManager sin pasar por RoomManager.leave
    # (ej. race entre desconexión y esta lectura) -- misma tolerancia que EventDispatcher.
    await connection_manager.unregister(connection_id)

    summary = service.connected_users_summary(remate_id)

    assert summary == []


# --- global_stats ---------------------------------------------------------------------------


async def test_global_stats_reflects_multiple_rooms_and_connections() -> None:
    service, _room_manager, connection_manager, _event_bus = _make_service()
    room_a, room_b = _uuid(), _uuid()
    conns_a = [await _register_connection(connection_manager, user_id=_uuid()) for _ in range(2)]
    conns_b = [await _register_connection(connection_manager, user_id=_uuid()) for _ in range(3)]

    for c in conns_a:
        await service.join_room(room_a, c, _uuid())
    for c in conns_b:
        await service.join_room(room_b, c, _uuid())

    stats = service.global_stats()

    assert stats.active_rooms == 2
    assert stats.total_connections == 5
