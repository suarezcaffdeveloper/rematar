"""Tests unitarios de `RoomManager` (Épica 3, Módulo 3.4), en aislamiento total — sin
WebSocket, sin base de datos, sin Redis. Ver docs/21-sistema-de-salas.md y ADR-024.

Los tests de integración a través del endpoint real (`/api/v1/ws`) están en
`test_websocket_gateway.py`, sección "--- Salas ---".
"""

import uuid

from app.websocket.rooms import RoomManager


def _uuid() -> uuid.UUID:
    return uuid.uuid4()


# --- Creación y unión ------------------------------------------------------------------


async def test_join_creates_room_on_first_connection() -> None:
    manager = RoomManager()
    remate_id, connection_id = _uuid(), _uuid()

    joined = await manager.join(remate_id, connection_id)

    assert joined is True
    assert manager.room_count() == 1
    assert manager.connection_count(remate_id) == 1
    assert manager.connections_in_room(remate_id) == [connection_id]
    assert manager.room_id_for_connection(connection_id) == remate_id


async def test_second_connection_joins_existing_room_without_creating_a_new_one() -> None:
    manager = RoomManager()
    remate_id = _uuid()
    conn_a, conn_b = _uuid(), _uuid()

    await manager.join(remate_id, conn_a)
    await manager.join(remate_id, conn_b)

    assert manager.room_count() == 1
    assert manager.connection_count(remate_id) == 2
    assert set(manager.connections_in_room(remate_id)) == {conn_a, conn_b}


async def test_rejoining_same_room_is_idempotent() -> None:
    manager = RoomManager()
    remate_id, connection_id = _uuid(), _uuid()
    await manager.join(remate_id, connection_id)

    joined_again = await manager.join(remate_id, connection_id)

    assert joined_again is True
    assert manager.connection_count(remate_id) == 1


async def test_join_rejected_when_connection_already_in_a_different_room() -> None:
    manager = RoomManager()
    room_a, room_b, connection_id = _uuid(), _uuid(), _uuid()
    await manager.join(room_a, connection_id)

    joined = await manager.join(room_b, connection_id)

    assert joined is False
    assert manager.room_id_for_connection(connection_id) == room_a
    assert manager.connection_count(room_a) == 1
    assert manager.connection_count(room_b) == 0
    assert room_b not in manager.list_rooms()


# --- Salida y eliminación automática ----------------------------------------------------


async def test_leave_removes_connection_and_deletes_empty_room() -> None:
    manager = RoomManager()
    remate_id, connection_id = _uuid(), _uuid()
    await manager.join(remate_id, connection_id)

    left_room_id = await manager.leave(connection_id)

    assert left_room_id == remate_id
    assert manager.room_count() == 0
    assert remate_id not in manager.list_rooms()
    assert manager.room_id_for_connection(connection_id) is None


async def test_leave_keeps_room_alive_while_other_connections_remain() -> None:
    manager = RoomManager()
    remate_id = _uuid()
    conn_a, conn_b = _uuid(), _uuid()
    await manager.join(remate_id, conn_a)
    await manager.join(remate_id, conn_b)

    await manager.leave(conn_a)

    assert manager.room_count() == 1
    assert manager.connections_in_room(remate_id) == [conn_b]


async def test_leave_when_not_in_any_room_is_a_safe_no_op() -> None:
    manager = RoomManager()

    result = await manager.leave(_uuid())

    assert result is None
    assert manager.room_count() == 0


async def test_leave_then_join_a_different_room_succeeds() -> None:
    manager = RoomManager()
    room_a, room_b, connection_id = _uuid(), _uuid(), _uuid()
    await manager.join(room_a, connection_id)

    await manager.leave(connection_id)
    joined = await manager.join(room_b, connection_id)

    assert joined is True
    assert manager.room_id_for_connection(connection_id) == room_b
    assert room_a not in manager.list_rooms()


# --- Múltiples conexiones del mismo usuario (distintos connection_id) ------------------


async def test_same_user_two_connections_can_join_the_same_room() -> None:
    # RoomManager no distingue usuarios, solo connection_id -- este test documenta que
    # dos conexiones (dos pestañas) del mismo usuario cuentan como dos miembros.
    manager = RoomManager()
    remate_id = _uuid()
    tab_1, tab_2 = _uuid(), _uuid()

    await manager.join(remate_id, tab_1)
    await manager.join(remate_id, tab_2)

    assert manager.connection_count(remate_id) == 2


async def test_same_user_two_connections_can_be_in_different_rooms_independently() -> None:
    manager = RoomManager()
    room_a, room_b = _uuid(), _uuid()
    tab_1, tab_2 = _uuid(), _uuid()

    await manager.join(room_a, tab_1)
    await manager.join(room_b, tab_2)

    assert manager.room_id_for_connection(tab_1) == room_a
    assert manager.room_id_for_connection(tab_2) == room_b
    assert manager.room_count() == 2


# --- Métricas ----------------------------------------------------------------------------


async def test_metrics_reflect_multiple_rooms_and_connections() -> None:
    manager = RoomManager()
    room_a, room_b = _uuid(), _uuid()
    conns_a = [_uuid() for _ in range(3)]
    conns_b = [_uuid() for _ in range(2)]

    for c in conns_a:
        await manager.join(room_a, c)
    for c in conns_b:
        await manager.join(room_b, c)

    assert manager.room_count() == 2
    assert manager.connection_count(room_a) == 3
    assert manager.connection_count(room_b) == 2
    assert manager.total_connections() == 5
    assert set(manager.list_rooms()) == {room_a, room_b}


async def test_connection_count_for_unknown_room_is_zero() -> None:
    manager = RoomManager()

    assert manager.connection_count(_uuid()) == 0
    assert manager.connections_in_room(_uuid()) == []
