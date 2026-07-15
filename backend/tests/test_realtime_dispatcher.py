"""Tests de `EventDispatcher` (Épica 3, Módulo 3.5), en aislamiento de Redis/HTTP: usa
un `ConnectionManager` y un `RoomManager` reales (Módulos 3.3/3.4, sin mocks -- son
`dict` en memoria, rápidos) y un `WebSocket` falso que solo registra lo que recibió. Los
tests de punta a punta contra el servidor real (Redis Pub/Sub incluido) están en
`test_realtime_sync.py`.
"""

import json
import uuid
from decimal import Decimal

from app.modules.ofertas.events import OfertaAccepted
from app.modules.remates.events import RemateStarted
from app.realtime.dispatcher import EventDispatcher
from app.websocket.manager import ConnectionContext, ConnectionManager
from app.websocket.rooms import RoomManager


class _FakeWebSocket:
    def __init__(self, *, fail: bool = False) -> None:
        self.sent: list[str] = []
        self._fail = fail

    async def send_text(self, data: str) -> None:
        if self._fail:
            raise RuntimeError("socket ya cerrado")
        self.sent.append(data)


def _make_connection(*, fail: bool = False) -> tuple[_FakeWebSocket, ConnectionContext]:
    ws = _FakeWebSocket(fail=fail)
    context = ConnectionContext(connection_id=uuid.uuid4(), user_id=uuid.uuid4(), websocket=ws)
    return ws, context


async def _join(
    connection_manager: ConnectionManager,
    room_manager: RoomManager,
    context: ConnectionContext,
    remate_id: uuid.UUID,
) -> None:
    await connection_manager.register(context)
    await room_manager.join(remate_id, context.connection_id)


def _remate_started(remate_id: uuid.UUID) -> str:
    return RemateStarted(remate_id=remate_id).model_dump_json()


async def test_event_delivered_only_to_connections_in_the_matching_room() -> None:
    connection_manager = ConnectionManager()
    room_manager = RoomManager()
    dispatcher = EventDispatcher(connection_manager, room_manager)

    room_a, room_b = uuid.uuid4(), uuid.uuid4()
    ws_a1, ctx_a1 = _make_connection()
    ws_a2, ctx_a2 = _make_connection()
    ws_b, ctx_b = _make_connection()
    await _join(connection_manager, room_manager, ctx_a1, room_a)
    await _join(connection_manager, room_manager, ctx_a2, room_a)
    await _join(connection_manager, room_manager, ctx_b, room_b)

    await dispatcher.dispatch(_remate_started(room_a))

    assert len(ws_a1.sent) == 1
    assert len(ws_a2.sent) == 1
    assert ws_b.sent == []

    delivered = json.loads(ws_a1.sent[0])
    assert delivered["type"] == "domain_event"
    assert delivered["event_type"] == "remate.started"
    assert delivered["remate_id"] == str(room_a)
    assert delivered["payload"]["event_type"] == "remate.started"


async def test_event_for_room_with_no_connections_is_a_safe_no_op() -> None:
    connection_manager = ConnectionManager()
    room_manager = RoomManager()
    dispatcher = EventDispatcher(connection_manager, room_manager)

    await dispatcher.dispatch(_remate_started(uuid.uuid4()))  # no debe lanzar


async def test_unregistered_event_type_is_ignored() -> None:
    connection_manager = ConnectionManager()
    room_manager = RoomManager()
    dispatcher = EventDispatcher(connection_manager, room_manager)

    room_id = uuid.uuid4()
    ws, ctx = _make_connection()
    await _join(connection_manager, room_manager, ctx, room_id)

    unregistered = json.dumps(
        {
            "event_id": str(uuid.uuid4()),
            "occurred_at": "2026-07-20T10:00:00Z",
            "event_type": "remate.created",  # deliberadamente fuera del registro
            "remate_id": str(room_id),
            "owner_id": str(uuid.uuid4()),
            "title": "x",
            "category": "hacienda",
        }
    )

    await dispatcher.dispatch(unregistered)

    assert ws.sent == []


async def test_invalid_json_is_ignored_without_raising() -> None:
    connection_manager = ConnectionManager()
    room_manager = RoomManager()
    dispatcher = EventDispatcher(connection_manager, room_manager)

    await dispatcher.dispatch("esto no es json")  # no debe lanzar


async def test_payload_that_does_not_match_registered_schema_is_ignored() -> None:
    connection_manager = ConnectionManager()
    room_manager = RoomManager()
    dispatcher = EventDispatcher(connection_manager, room_manager)

    room_id = uuid.uuid4()
    ws, ctx = _make_connection()
    await _join(connection_manager, room_manager, ctx, room_id)

    # "remate.started" registrado, pero sin remate_id -- no matchea RemateStarted.
    broken = json.dumps({"event_type": "remate.started"})

    await dispatcher.dispatch(broken)

    assert ws.sent == []


async def test_delivery_failure_to_one_connection_does_not_block_the_rest() -> None:
    connection_manager = ConnectionManager()
    room_manager = RoomManager()
    dispatcher = EventDispatcher(connection_manager, room_manager)

    room_id = uuid.uuid4()
    ws_broken, ctx_broken = _make_connection(fail=True)
    ws_ok, ctx_ok = _make_connection()
    await _join(connection_manager, room_manager, ctx_broken, room_id)
    await _join(connection_manager, room_manager, ctx_ok, room_id)

    await dispatcher.dispatch(_remate_started(room_id))  # no debe lanzar

    assert ws_broken.sent == []
    assert len(ws_ok.sent) == 1


async def test_connection_removed_between_room_snapshot_and_send_is_skipped_safely() -> None:
    connection_manager = ConnectionManager()
    room_manager = RoomManager()
    dispatcher = EventDispatcher(connection_manager, room_manager)

    room_id = uuid.uuid4()
    ws, ctx = _make_connection()
    await _join(connection_manager, room_manager, ctx, room_id)

    # Se desregistra del ConnectionManager pero se queda en la sala -- exactamente lo
    # que pasaría si el `finally` de router.py todavía no corrió `room_manager.leave`.
    await connection_manager.unregister(ctx.connection_id)

    await dispatcher.dispatch(_remate_started(room_id))  # no debe lanzar

    assert ws.sent == []


async def test_oferta_accepted_event_is_translated_and_delivered() -> None:
    connection_manager = ConnectionManager()
    room_manager = RoomManager()
    dispatcher = EventDispatcher(connection_manager, room_manager)

    room_id = uuid.uuid4()
    ws, ctx = _make_connection()
    await _join(connection_manager, room_manager, ctx, room_id)

    event = OfertaAccepted(
        remate_id=room_id,
        oferta_id=uuid.uuid4(),
        lote_id=uuid.uuid4(),
        buyer_id=uuid.uuid4(),
        amount=Decimal("1500.00"),
    )

    await dispatcher.dispatch(event.model_dump_json())

    assert len(ws.sent) == 1
    delivered = json.loads(ws.sent[0])
    assert delivered["event_type"] == "oferta.accepted"
    assert delivered["payload"]["amount"] == "1500.00"
