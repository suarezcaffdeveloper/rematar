"""Tests unitarios de la autorización de `join_room` (Fase 2 de remediación del
WebSocket Security Audit) -- llaman directamente a
`app.websocket.router._handle_join_room` con dobles de prueba livianos, mismo criterio
que `tests/test_realtime_dispatcher.py`: `ConnectionManager`/`RoomManager`/
`PresenceService` REALES (en memoria, sin mocks -- son rápidos y deterministas), sin
Redis ni Postgres reales.

Complementan (no reemplazan) los tests de integración de punta a punta con Postgres/
Redis reales de `tests/test_websocket_gateway.py`, que ejercitan el mismo flujo a
través de `ws_client`/`TestClient` con `SnapshotService`/`ModerationService` reales
contra el dominio persistido -- acá se aísla exclusivamente la lógica de orquestación
de `_handle_join_room` en sí (orden de los chequeos, qué se llama y qué no), con dobles
de prueba en vez del servicio real, para verificarla rápido y sin depender de
infraestructura externa.

La autorización se resuelve vía `SnapshotService.assert_visible` (no una dependencia de
`RemateService` propia del Gateway -- ver docstring de `app/websocket/router.py` y
`tests/test_architecture_boundaries.py::test_gateway_websocket_never_imports_domain`),
así que el doble de prueba de acá abajo es de `SnapshotService`, con `assert_visible` y
`build` controlados por separado.

`_handle_join_room` ahora recibe además `rate_limiter`/`settings` (Fase 4 de remediación
del WebSocket Security Audit, ver `app/websocket/rate_limit.py`) -- dependencia directa
del cambio de firma, no una reescritura de estos tests: `_AlwaysAllowRateLimiter` es un
doble que nunca rechaza, para que estos tests unitarios sigan aislando exclusivamente la
autorización de dominio (Fase 2), no el rate limiting (que tiene su propia suite, ver
`tests/test_websocket_rate_limiting.py`).
"""

import json
import uuid

from app.core.config import get_settings
from app.core.exceptions import NotFoundError
from app.moderation.schemas import ERROR_BANNED_FROM_ROOM
from app.presence.service import PresenceService
from app.snapshot.messages import SNAPSHOT_UNAVAILABLE
from app.websocket.manager import ConnectionContext, ConnectionManager
from app.websocket.messages import JoinRoomMessage
from app.websocket.rooms import RoomManager
from app.websocket.router import _handle_join_room


class _AlwaysAllowRateLimiter:
    async def allow(self, key: str, *, limit: int, window_seconds: int, scope: str) -> bool:
        return True


class _FakeWebSocket:
    def __init__(self) -> None:
        self.sent: list[str] = []

    async def send_text(self, data: str) -> None:
        self.sent.append(data)

    def messages(self) -> list[dict]:
        return [json.loads(m) for m in self.sent]


class _FakeUser:
    def __init__(self, user_id: uuid.UUID) -> None:
        self.id = user_id


class _FakeEventBus:
    """Implementa el `Protocol EventBus` (`app/events/bus.py`) por duck typing --
    registra qué `event_type` se publicó, sin tocar Redis."""

    def __init__(self) -> None:
        self.published: list[str] = []

    async def publish(self, event) -> None:
        self.published.append(event.event_type)


class _StubModerationService:
    def __init__(self, *, banned: bool = False) -> None:
        self._banned = banned
        self.calls: list[uuid.UUID] = []

    async def is_banned(self, remate_id: uuid.UUID, user_id: uuid.UUID) -> bool:
        self.calls.append(remate_id)
        return self._banned


class _StubSnapshotService:
    """Doble de `SnapshotService` -- controla `assert_visible` (autorización, Fase 2) y
    `build` (armado del snapshot en sí) por separado, para poder distinguir en los
    tests "rechazado por autorización" de "autorizado pero el snapshot en sí falla"
    (ver `test_websocket_gateway.py::
    test_snapshot_build_failure_after_authorized_join_keeps_room_membership` para el
    equivalente de integración de este segundo caso)."""

    def __init__(self, *, authorized: bool) -> None:
        self._authorized = authorized
        self.assert_visible_calls: list[uuid.UUID] = []

    async def assert_visible(self, remate_id: uuid.UUID, viewer) -> None:
        self.assert_visible_calls.append(remate_id)
        if not self._authorized:
            raise NotFoundError("Remate no encontrado.")

    async def build(self, *args, **kwargs):
        # El contenido del snapshot no es el foco de estos tests -- alcanza con que
        # `_send_snapshot` no reviente; se comporta como cualquier snapshot real que
        # fallaría con un doble de prueba que no arma un `RemateStateSnapshot` completo.
        raise NotFoundError("sin snapshot real en este test unitario")


def _raw_join(remate_id: uuid.UUID) -> str:
    return JoinRoomMessage(remate_id=remate_id).model_dump_json()


def _new_context() -> tuple[_FakeWebSocket, _FakeUser, ConnectionContext]:
    ws = _FakeWebSocket()
    user = _FakeUser(uuid.uuid4())
    context = ConnectionContext(connection_id=uuid.uuid4(), user_id=user.id, websocket=ws)
    return ws, user, context


async def _join(
    *,
    context: ConnectionContext,
    ws: _FakeWebSocket,
    user: _FakeUser,
    presence_service: PresenceService,
    remate_id: uuid.UUID,
    authorized: bool = True,
    banned: bool = False,
) -> tuple[_StubSnapshotService, _StubModerationService]:
    snapshot_service = _StubSnapshotService(authorized=authorized)
    moderation_service = _StubModerationService(banned=banned)
    await _handle_join_room(
        _raw_join(remate_id),
        context,
        ws,
        presence_service,
        snapshot_service,
        moderation_service,
        _AlwaysAllowRateLimiter(),
        get_settings(),
        user,
    )
    return snapshot_service, moderation_service


# --- Test 1/2 (equivalentes unitarios): autorización ANTES de RoomManager.join --------


async def test_unauthorized_join_never_calls_room_manager_join() -> None:
    connection_manager = ConnectionManager()
    room_manager = RoomManager()
    presence_service = PresenceService(room_manager, connection_manager, _FakeEventBus())
    ws, user, context = _new_context()
    await connection_manager.register(context)

    remate_id = uuid.uuid4()
    snapshot_service, _ = await _join(
        context=context, ws=ws, user=user, presence_service=presence_service,
        remate_id=remate_id, authorized=False,
    )

    assert snapshot_service.assert_visible_calls == [remate_id]  # sí se consultó
    assert room_manager.connection_count(remate_id) == 0  # pero nunca se unió
    assert room_manager.room_count() == 0
    assert room_manager.room_id_for_connection(context.connection_id) is None

    messages = ws.messages()
    assert len(messages) == 1
    assert messages[0]["type"] == "error"
    assert messages[0]["code"] == SNAPSHOT_UNAVAILABLE  # mismo código que ya existía


# --- Test 3: usuario autorizado sigue funcionando exactamente igual que antes ---------


async def test_authorized_join_calls_room_manager_join_and_confirms() -> None:
    connection_manager = ConnectionManager()
    room_manager = RoomManager()
    presence_service = PresenceService(room_manager, connection_manager, _FakeEventBus())
    ws, user, context = _new_context()
    await connection_manager.register(context)

    remate_id = uuid.uuid4()
    snapshot_service, _ = await _join(
        context=context, ws=ws, user=user, presence_service=presence_service,
        remate_id=remate_id, authorized=True,
    )

    assert snapshot_service.assert_visible_calls == [remate_id]
    assert room_manager.connection_count(remate_id) == 1
    assert room_manager.room_id_for_connection(context.connection_id) == remate_id
    assert any(m["type"] == "room_joined" for m in ws.messages())


# --- Test 4: el chequeo de ban sigue funcionando y corre ANTES que la autorización ----


async def test_ban_check_rejects_before_authorization_is_even_consulted() -> None:
    connection_manager = ConnectionManager()
    room_manager = RoomManager()
    presence_service = PresenceService(room_manager, connection_manager, _FakeEventBus())
    ws, user, context = _new_context()
    await connection_manager.register(context)

    remate_id = uuid.uuid4()
    # authorized=True a propósito: si la autorización se llegara a consultar antes que
    # el ban, este test no distinguiría "se saltó el orden" de "está bien rechazado
    # igual" -- con authorized=True, solo el chequeo de ban puede explicar el rechazo.
    snapshot_service, moderation_service = await _join(
        context=context, ws=ws, user=user, presence_service=presence_service,
        remate_id=remate_id, authorized=True, banned=True,
    )

    assert moderation_service.calls == [remate_id]
    assert snapshot_service.assert_visible_calls == []  # nunca se llegó a consultar
    assert room_manager.connection_count(remate_id) == 0

    messages = ws.messages()
    assert messages[0]["code"] == ERROR_BANNED_FROM_ROOM


# --- Test 5 (obligatorio): un join rechazado a B no saca al usuario de A --------------


async def test_unauthorized_join_to_room_b_does_not_evict_valid_room_a() -> None:
    connection_manager = ConnectionManager()
    room_manager = RoomManager()
    presence_service = PresenceService(room_manager, connection_manager, _FakeEventBus())
    ws, user, context = _new_context()
    await connection_manager.register(context)

    room_a, room_b = uuid.uuid4(), uuid.uuid4()

    await _join(
        context=context, ws=ws, user=user, presence_service=presence_service,
        remate_id=room_a, authorized=True,
    )
    assert room_manager.room_id_for_connection(context.connection_id) == room_a

    await _join(
        context=context, ws=ws, user=user, presence_service=presence_service,
        remate_id=room_b, authorized=False,
    )

    assert room_manager.room_id_for_connection(context.connection_id) == room_a
    assert room_manager.connection_count(room_b) == 0
    assert room_manager.connection_count(room_a) == 1


# --- Test 7 (regresión): una sala por conexión sigue funcionando ----------------------


async def test_authorized_join_to_a_different_room_while_already_in_one_is_rejected() -> None:
    """Mismo mecanismo que antes de la Fase 2 (`RoomManager.join`, sin cambios): estar
    ya en A rechaza un intento de B aunque B sea perfectamente autorizado -- hay que
    salir de A primero. La Fase 2 no altera esta regla en absoluto."""
    connection_manager = ConnectionManager()
    room_manager = RoomManager()
    presence_service = PresenceService(room_manager, connection_manager, _FakeEventBus())
    ws, user, context = _new_context()
    await connection_manager.register(context)

    room_a, room_b = uuid.uuid4(), uuid.uuid4()
    await _join(
        context=context, ws=ws, user=user, presence_service=presence_service,
        remate_id=room_a, authorized=True,
    )
    ws.sent.clear()

    snapshot_service, _ = await _join(
        context=context, ws=ws, user=user, presence_service=presence_service,
        remate_id=room_b, authorized=True,  # B autorizado, pero ya está en A
    )

    assert snapshot_service.assert_visible_calls == [room_b]  # sí se consultó...
    assert room_manager.room_id_for_connection(context.connection_id) == room_a  # ...pero sigue en A
    messages = ws.messages()
    assert messages[-1]["type"] == "error"
    assert messages[-1]["code"] == "already_in_room"


# --- Test 8 (obligatorio): un join rechazado no publica presencia --------------------


async def test_unauthorized_join_does_not_publish_presence_connected() -> None:
    connection_manager = ConnectionManager()
    room_manager = RoomManager()
    event_bus = _FakeEventBus()
    presence_service = PresenceService(room_manager, connection_manager, event_bus)
    ws, user, context = _new_context()
    await connection_manager.register(context)

    remate_id = uuid.uuid4()
    await _join(
        context=context, ws=ws, user=user, presence_service=presence_service,
        remate_id=remate_id, authorized=False,
    )

    assert event_bus.published == []


async def test_authorized_join_does_publish_presence_connected() -> None:
    """Contraste directo con el test anterior -- confirma que la ausencia de evento de
    presencia en el rechazo no es porque `_FakeEventBus`/`PresenceService` estén rotos,
    sino específicamente porque el join rechazado nunca llega a `RoomManager.join`."""
    connection_manager = ConnectionManager()
    room_manager = RoomManager()
    event_bus = _FakeEventBus()
    presence_service = PresenceService(room_manager, connection_manager, event_bus)
    ws, user, context = _new_context()
    await connection_manager.register(context)

    remate_id = uuid.uuid4()
    await _join(
        context=context, ws=ws, user=user, presence_service=presence_service,
        remate_id=remate_id, authorized=True,
    )

    assert event_bus.published == ["presencia.usuario_conectado"]
