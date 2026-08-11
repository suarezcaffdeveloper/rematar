"""Tests de integración del Gateway WebSocket (Épica 3, Módulo 3.3).

Usan `TestClient` de Starlette (no la fixture `client` basada en `httpx`, que no habla
el protocolo WebSocket) — ver la fixture `ws_client` en `conftest.py` y
docs/adr/ADR-023-gateway-websocket.md, sección E, para por qué necesita su propia
estrategia de conexión a la base.

Algunos tests necesitan timeouts de heartbeat/autenticación mucho más cortos que los
default de producción — para esos, `_build_ws_app` arma una instancia de la app propia
con `WS_*_SECONDS` sobreescritos vía `Depends(get_settings)`, en vez de usar la fixture
compartida `ws_client`.
"""

import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from starlette.websockets import WebSocketDisconnect

from app.core.config import get_settings
from app.db.session import get_db
from app.main import create_app
from app.snapshot.messages import SNAPSHOT_UNAVAILABLE
from app.websocket import close_codes
from app.websocket.rooms import ERROR_ALREADY_IN_ROOM, ERROR_INVALID_ROOM_ID, ERROR_NOT_IN_ROOM

WS_URL = "/api/v1/ws"
REGISTER_URL = "/api/v1/auth/register"
LOGIN_URL = "/api/v1/auth/login"
REMATES_URL = "/api/v1/remates"


def _build_ws_app(db_engine: AsyncEngine, **settings_overrides: float):
    # `str(db_engine.url)` enmascara la contraseña (`***`) por seguridad — hace falta
    # `render_as_string(hide_password=False)` para reconectar de verdad.
    database_url = db_engine.url.render_as_string(hide_password=False)

    async def _override_get_db() -> AsyncIterator[AsyncSession]:
        engine = create_async_engine(database_url)
        session_factory = async_sessionmaker(bind=engine, expire_on_commit=False)
        async with session_factory() as session:
            yield session
        await engine.dispose()

    @asynccontextmanager
    async def _chat_session_factory() -> AsyncIterator[AsyncSession]:
        # Mismo problema que `_override_get_db` de acá arriba, para
        # `ChatSystemEventDispatcher` (Épica 6, Módulo 6.4, ver `tests/conftest.py`,
        # docstring de `client`) -- ese consumidor de fondo no pasa por
        # `app.dependency_overrides`.
        engine = create_async_engine(database_url)
        session_factory = async_sessionmaker(bind=engine, expire_on_commit=False)
        async with session_factory() as session:
            yield session
        await engine.dispose()

    app = create_app()
    app.dependency_overrides[get_db] = _override_get_db
    app.state.db_session_factory = _chat_session_factory

    if settings_overrides:
        base_settings = get_settings()
        custom_settings = base_settings.model_copy(update=settings_overrides)
        app.dependency_overrides[get_settings] = lambda: custom_settings

    return app


def _register_and_login(client: TestClient, *, email: str, role: str = "comprador") -> str:
    client.post(
        REGISTER_URL,
        json={
            "email": email,
            "password": "password123",
            "confirm_password": "password123",
            "full_name": "Test",
            "phone": "+5491122334455",
            "role": role,
        },
    )
    login = client.post(LOGIN_URL, data={"username": email, "password": "password123"})
    assert login.status_code == 200, login.text
    return login.json()["access_token"]


# Prefijos de `event_type` que corresponden a canales "laterales" (Épica 6): eventos
# que un `join_room`/una transición de remate dispara de forma asíncrona, además de los
# mensajes de protocolo o de dominio que cada test de esta sección puntualmente espera.
# Presencia (Módulo 6.2) y Chat (Módulo 6.4, sus mensajes de sistema reaccionan a los
# mismos `remate.*`/`lote.*` que estos tests publican) son, ambos, ruido acá.
_SIDE_CHANNEL_EVENT_PREFIXES = ("presencia.", "chat.")


def _receive_protocol_message(websocket) -> dict:
    """`receive_json()` que descarta cualquier `domain_event` de un canal lateral
    (presencia, chat -- ver `_SIDE_CHANNEL_EVENT_PREFIXES`) que llegue intercalado. Un
    `join_room`/`leave_room` real publica su propio evento de presencia de forma
    asíncrona (Redis Pub/Sub -> Event Consumer -> Event Dispatcher, sin cambios), y una
    transición de remate/lote dispara además un mensaje de sistema de chat -- ninguno de
    los dos tiene garantía de en qué punto exacto, relativo a los mensajes de protocolo
    que el Gateway ya manda de forma síncrona (`connected`/`room_joined`/`snapshot`/
    `error`/`room_left`/`ping`), termina de entregarse. A los tests de esta sección les
    importa la mecánica del Gateway/salas/snapshot, no presencia ni chat (que tienen sus
    propias secciones) -- filtra el ruido en vez de asumir un orden fijo entre caminos."""
    while True:
        message = websocket.receive_json()
        is_side_channel_event = message.get("type") == "domain_event" and str(
            message.get("event_type", "")
        ).startswith(_SIDE_CHANNEL_EVENT_PREFIXES)
        if not is_side_channel_event:
            return message


def _drain_join_room_extras(websocket) -> dict:
    """Después de `room_joined`, el Gateway manda un `snapshot` (o, si el `remate_id`
    no corresponde a un remate real, un `error/snapshot_unavailable` -- Módulo 3.6, ver
    docs/23-snapshot-service.md). La mayoría de los tests de salas de acá usan
    `remate_id` aleatorios a propósito (les importa solo la mecánica de la sala, no el
    dominio, ver ADR-024 sección D) -- este helper consume ese mensaje extra sin
    asumir cuál de los dos llega, para no romper el orden de los `receive_json()`
    siguientes."""
    return _receive_protocol_message(websocket)


# --- Autenticación -------------------------------------------------------------------


async def test_valid_token_connects_and_receives_connected_message(ws_client: TestClient) -> None:
    token = _register_and_login(ws_client, email="ws1@example.com")

    with ws_client.websocket_connect(WS_URL) as websocket:
        websocket.send_json({"type": "auth", "token": token})
        response = websocket.receive_json()

    assert response["type"] == "connected"
    assert "connection_id" in response
    assert "user_id" in response


async def test_invalid_token_closes_with_unauthorized_code(ws_client: TestClient) -> None:
    with ws_client.websocket_connect(WS_URL) as websocket:
        websocket.send_json({"type": "auth", "token": "esto-no-es-un-jwt-valido"})
        try:
            websocket.receive_json()
            raise AssertionError("se esperaba que la conexión se cerrara")
        except WebSocketDisconnect as exc:
            assert exc.code == close_codes.UNAUTHORIZED


async def test_malformed_first_message_closes_with_invalid_message_code(
    ws_client: TestClient,
) -> None:
    with ws_client.websocket_connect(WS_URL) as websocket:
        websocket.send_json({"type": "greeting", "hello": "world"})
        try:
            websocket.receive_json()
            raise AssertionError("se esperaba que la conexión se cerrara")
        except WebSocketDisconnect as exc:
            assert exc.code == close_codes.INVALID_MESSAGE


async def test_non_json_first_message_closes_with_invalid_message_code(
    ws_client: TestClient,
) -> None:
    with ws_client.websocket_connect(WS_URL) as websocket:
        websocket.send_text("no soy json")
        try:
            websocket.receive_json()
            raise AssertionError("se esperaba que la conexión se cerrara")
        except WebSocketDisconnect as exc:
            assert exc.code == close_codes.INVALID_MESSAGE


async def test_auth_timeout_closes_connection(db_engine: AsyncEngine) -> None:
    app = _build_ws_app(db_engine, WS_AUTH_TIMEOUT_SECONDS=0.3)
    with TestClient(app) as client, client.websocket_connect(WS_URL) as websocket:
        try:
            websocket.receive_json()
            raise AssertionError("se esperaba que la conexión se cerrara por timeout")
        except WebSocketDisconnect as exc:
            assert exc.code == close_codes.AUTH_TIMEOUT


async def test_any_authenticated_role_can_connect(ws_client: TestClient) -> None:
    token = _register_and_login(ws_client, email="ws-rematador@example.com", role="rematador")

    with ws_client.websocket_connect(WS_URL) as websocket:
        websocket.send_json({"type": "auth", "token": token})
        response = websocket.receive_json()

    assert response["type"] == "connected"


# --- Administrador de conexiones -----------------------------------------------------


async def test_connection_is_registered_while_active(ws_client: TestClient) -> None:
    token = _register_and_login(ws_client, email="ws2@example.com")
    manager = ws_client.app.state.connection_manager
    assert manager.count() == 0

    with ws_client.websocket_connect(WS_URL) as websocket:
        websocket.send_json({"type": "auth", "token": token})
        response = websocket.receive_json()

        assert manager.count() == 1
        context = manager.get(uuid.UUID(response["connection_id"]))
        assert context is not None
        assert str(context.user_id) == response["user_id"]


async def test_connection_is_unregistered_after_client_disconnects(ws_client: TestClient) -> None:
    token = _register_and_login(ws_client, email="ws3@example.com")
    manager = ws_client.app.state.connection_manager

    with ws_client.websocket_connect(WS_URL) as websocket:
        websocket.send_json({"type": "auth", "token": token})
        websocket.receive_json()
        assert manager.count() == 1

    assert manager.count() == 0


async def test_connections_for_user_tracks_multiple_connections(ws_client: TestClient) -> None:
    token = _register_and_login(ws_client, email="ws4@example.com")
    manager = ws_client.app.state.connection_manager

    with ws_client.websocket_connect(WS_URL) as ws_a, ws_client.websocket_connect(WS_URL) as ws_b:
        ws_a.send_json({"type": "auth", "token": token})
        connected_a = ws_a.receive_json()
        ws_b.send_json({"type": "auth", "token": token})
        ws_b.receive_json()

        user_id = uuid.UUID(connected_a["user_id"])
        connections = manager.connections_for_user(user_id)
        assert len(connections) == 2


# --- Heartbeat -------------------------------------------------------------------------


async def test_heartbeat_ping_sent_and_pong_keeps_connection_alive(db_engine: AsyncEngine) -> None:
    app = _build_ws_app(db_engine, WS_PING_INTERVAL_SECONDS=0.2, WS_PONG_TIMEOUT_SECONDS=5.0)
    with TestClient(app) as client:
        token = _register_and_login(client, email="ws5@example.com")
        with client.websocket_connect(WS_URL) as websocket:
            websocket.send_json({"type": "auth", "token": token})
            websocket.receive_json()  # connected

            ping = websocket.receive_json()
            assert ping["type"] == "ping"

            websocket.send_json({"type": "pong"})

            # Si el pong no hubiera contado, la conexión se habría cerrado por timeout
            # antes de este segundo ping — que llegue confirma que se mantuvo viva.
            ping_again = websocket.receive_json()
            assert ping_again["type"] == "ping"


async def test_heartbeat_timeout_closes_connection_without_pong(db_engine: AsyncEngine) -> None:
    app = _build_ws_app(db_engine, WS_PING_INTERVAL_SECONDS=0.2, WS_PONG_TIMEOUT_SECONDS=0.3)
    with TestClient(app) as client:
        token = _register_and_login(client, email="ws6@example.com")
        with client.websocket_connect(WS_URL) as websocket:
            websocket.send_json({"type": "auth", "token": token})
            websocket.receive_json()  # connected
            websocket.receive_json()  # primer ping — nunca se responde con pong

            try:
                websocket.receive_json()
                raise AssertionError("se esperaba que la conexión se cerrara por heartbeat")
            except WebSocketDisconnect as exc:
                assert exc.code == close_codes.HEARTBEAT_TIMEOUT


async def test_unrecognized_message_after_auth_does_not_break_connection(
    ws_client: TestClient,
) -> None:
    token = _register_and_login(ws_client, email="ws7@example.com")

    with ws_client.websocket_connect(WS_URL) as websocket:
        websocket.send_json({"type": "auth", "token": token})
        websocket.receive_json()  # connected

        websocket.send_text("un mensaje que el Gateway no reconoce")
        websocket.send_json({"type": "unknown_future_type", "payload": {}})

        # La conexión sigue viva: un pong explícito no debería cerrarla.
        websocket.send_json({"type": "pong"})


# --- Salas (Épica 3, Módulo 3.4) -------------------------------------------------------


async def test_join_room_creates_room_and_confirms(ws_client: TestClient) -> None:
    token = _register_and_login(ws_client, email="room1@example.com")
    remate_id = uuid.uuid4()
    room_manager = ws_client.app.state.room_manager

    with ws_client.websocket_connect(WS_URL) as websocket:
        websocket.send_json({"type": "auth", "token": token})
        websocket.receive_json()  # connected

        websocket.send_json({"type": "join_room", "remate_id": str(remate_id)})
        response = _receive_protocol_message(websocket)

        assert response == {"schema_version": 1, "type": "room_joined", "remate_id": str(remate_id)}
        assert room_manager.room_count() == 1
        assert room_manager.connection_count(remate_id) == 1

    # Al desconectar, la sala (que tenía una única conexión) se elimina sola.
    assert room_manager.room_count() == 0


async def test_join_room_with_invalid_remate_id_returns_error(ws_client: TestClient) -> None:
    token = _register_and_login(ws_client, email="room2@example.com")

    with ws_client.websocket_connect(WS_URL) as websocket:
        websocket.send_json({"type": "auth", "token": token})
        websocket.receive_json()  # connected

        websocket.send_json({"type": "join_room", "remate_id": "esto-no-es-un-uuid"})
        response = websocket.receive_json()

        assert response["type"] == "error"
        assert response["code"] == ERROR_INVALID_ROOM_ID


async def test_join_room_already_in_another_room_returns_error(ws_client: TestClient) -> None:
    token = _register_and_login(ws_client, email="room3@example.com")
    room_a, room_b = uuid.uuid4(), uuid.uuid4()

    with ws_client.websocket_connect(WS_URL) as websocket:
        websocket.send_json({"type": "auth", "token": token})
        connected = websocket.receive_json()

        websocket.send_json({"type": "join_room", "remate_id": str(room_a)})
        websocket.receive_json()  # room_joined
        _drain_join_room_extras(websocket)  # snapshot o snapshot_unavailable

        websocket.send_json({"type": "join_room", "remate_id": str(room_b)})
        response = _receive_protocol_message(websocket)

        assert response["type"] == "error"
        assert response["code"] == ERROR_ALREADY_IN_ROOM

        room_manager = ws_client.app.state.room_manager
        connection_id = uuid.UUID(connected["connection_id"])
        assert room_manager.room_id_for_connection(connection_id) == room_a
        assert room_b not in room_manager.list_rooms()


async def test_rejoining_same_room_is_idempotent_over_the_wire(ws_client: TestClient) -> None:
    token = _register_and_login(ws_client, email="room4@example.com")
    remate_id = uuid.uuid4()

    with ws_client.websocket_connect(WS_URL) as websocket:
        websocket.send_json({"type": "auth", "token": token})
        websocket.receive_json()  # connected

        websocket.send_json({"type": "join_room", "remate_id": str(remate_id)})
        first = _receive_protocol_message(websocket)
        _drain_join_room_extras(websocket)  # snapshot o snapshot_unavailable
        websocket.send_json({"type": "join_room", "remate_id": str(remate_id)})
        second = _receive_protocol_message(websocket)

        assert first == second
        assert first["type"] == "room_joined"


async def test_leave_room_confirms_and_removes_connection(ws_client: TestClient) -> None:
    token = _register_and_login(ws_client, email="room5@example.com")
    remate_id = uuid.uuid4()
    room_manager = ws_client.app.state.room_manager

    with ws_client.websocket_connect(WS_URL) as websocket:
        websocket.send_json({"type": "auth", "token": token})
        websocket.receive_json()  # connected
        websocket.send_json({"type": "join_room", "remate_id": str(remate_id)})
        websocket.receive_json()  # room_joined
        _drain_join_room_extras(websocket)  # snapshot o snapshot_unavailable

        websocket.send_json({"type": "leave_room"})
        response = _receive_protocol_message(websocket)

        assert response == {"schema_version": 1, "type": "room_left", "remate_id": str(remate_id)}
        assert room_manager.room_count() == 0


async def test_leave_room_when_not_in_a_room_returns_error(ws_client: TestClient) -> None:
    token = _register_and_login(ws_client, email="room6@example.com")

    with ws_client.websocket_connect(WS_URL) as websocket:
        websocket.send_json({"type": "auth", "token": token})
        websocket.receive_json()  # connected

        websocket.send_json({"type": "leave_room"})
        response = websocket.receive_json()

        assert response["type"] == "error"
        assert response["code"] == ERROR_NOT_IN_ROOM


async def test_leave_then_join_a_different_room_succeeds(ws_client: TestClient) -> None:
    token = _register_and_login(ws_client, email="room7@example.com")
    room_a, room_b = uuid.uuid4(), uuid.uuid4()

    with ws_client.websocket_connect(WS_URL) as websocket:
        websocket.send_json({"type": "auth", "token": token})
        websocket.receive_json()  # connected

        websocket.send_json({"type": "join_room", "remate_id": str(room_a)})
        websocket.receive_json()  # room_joined
        _drain_join_room_extras(websocket)  # snapshot o snapshot_unavailable

        websocket.send_json({"type": "leave_room"})
        _receive_protocol_message(websocket)  # room_left

        websocket.send_json({"type": "join_room", "remate_id": str(room_b)})
        response = _receive_protocol_message(websocket)

        assert response == {"schema_version": 1, "type": "room_joined", "remate_id": str(room_b)}


async def test_room_survives_when_one_of_two_connections_disconnects(
    ws_client: TestClient,
) -> None:
    token = _register_and_login(ws_client, email="room8@example.com")
    remate_id = uuid.uuid4()
    room_manager = ws_client.app.state.room_manager

    with ws_client.websocket_connect(WS_URL) as ws_a:
        ws_a.send_json({"type": "auth", "token": token})
        ws_a.receive_json()
        ws_a.send_json({"type": "join_room", "remate_id": str(remate_id)})
        ws_a.receive_json()

        with ws_client.websocket_connect(WS_URL) as ws_b:
            ws_b.send_json({"type": "auth", "token": token})
            ws_b.receive_json()
            ws_b.send_json({"type": "join_room", "remate_id": str(remate_id)})
            ws_b.receive_json()

            assert room_manager.connection_count(remate_id) == 2

        # ws_b se desconectó, ws_a sigue en la sala.
        assert room_manager.connection_count(remate_id) == 1
        assert room_manager.room_count() == 1

    assert room_manager.room_count() == 0


async def test_same_user_multiple_connections_join_same_room_independently(
    ws_client: TestClient,
) -> None:
    token = _register_and_login(ws_client, email="room9@example.com")
    remate_id = uuid.uuid4()
    room_manager = ws_client.app.state.room_manager

    with (
        ws_client.websocket_connect(WS_URL) as tab_1,
        ws_client.websocket_connect(WS_URL) as tab_2,
    ):
        tab_1.send_json({"type": "auth", "token": token})
        conn_1 = tab_1.receive_json()
        tab_2.send_json({"type": "auth", "token": token})
        conn_2 = tab_2.receive_json()

        tab_1.send_json({"type": "join_room", "remate_id": str(remate_id)})
        tab_1.receive_json()
        tab_2.send_json({"type": "join_room", "remate_id": str(remate_id)})
        tab_2.receive_json()

        assert conn_1["connection_id"] != conn_2["connection_id"]
        assert conn_1["user_id"] == conn_2["user_id"]
        assert room_manager.connection_count(remate_id) == 2


async def test_same_user_multiple_connections_join_different_rooms_independently(
    ws_client: TestClient,
) -> None:
    token = _register_and_login(ws_client, email="room10@example.com")
    room_a, room_b = uuid.uuid4(), uuid.uuid4()
    room_manager = ws_client.app.state.room_manager

    with (
        ws_client.websocket_connect(WS_URL) as tab_1,
        ws_client.websocket_connect(WS_URL) as tab_2,
    ):
        tab_1.send_json({"type": "auth", "token": token})
        tab_1.receive_json()
        tab_2.send_json({"type": "auth", "token": token})
        tab_2.receive_json()

        tab_1.send_json({"type": "join_room", "remate_id": str(room_a)})
        tab_1.receive_json()
        tab_2.send_json({"type": "join_room", "remate_id": str(room_b)})
        tab_2.receive_json()

        assert room_manager.room_count() == 2
        assert room_manager.connection_count(room_a) == 1
        assert room_manager.connection_count(room_b) == 1


async def test_heartbeat_after_joining_a_room_does_not_break_room_membership(
    db_engine: AsyncEngine,
) -> None:
    app = _build_ws_app(db_engine, WS_PING_INTERVAL_SECONDS=0.2, WS_PONG_TIMEOUT_SECONDS=5.0)
    remate_id = uuid.uuid4()
    with TestClient(app) as client:
        token = _register_and_login(client, email="room11@example.com")
        with client.websocket_connect(WS_URL) as websocket:
            websocket.send_json({"type": "auth", "token": token})
            connected = websocket.receive_json()
            websocket.send_json({"type": "join_room", "remate_id": str(remate_id)})
            websocket.receive_json()  # room_joined
            _drain_join_room_extras(websocket)  # snapshot o snapshot_unavailable

            ping = _receive_protocol_message(websocket)
            assert ping["type"] == "ping"
            websocket.send_json({"type": "pong"})

            room_manager = app.state.room_manager
            connection_id = uuid.UUID(connected["connection_id"])
            assert room_manager.room_id_for_connection(connection_id) == remate_id


# --- Snapshot (Épica 3, Módulo 3.6) ----------------------------------------------------


def _create_remate(client: TestClient, token: str, **overrides) -> dict:
    payload = {
        "title": "Remate de snapshot vía Gateway",
        "category": "hacienda",
        "starts_at": "2027-06-01T10:00:00Z",
    }
    payload.update(overrides)
    r = client.post(REMATES_URL, json=payload, headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 201, r.text
    return r.json()


def _create_lote(client: TestClient, token: str, remate_id: str, **overrides) -> dict:
    payload = {
        "lot_number": overrides.pop("lot_number", "1"),
        "title": "Toro Angus",
        "category": "hacienda",
        "base_price": "1000.00",
        "min_increment": "100.00",
        "reserve_price": "5000.00",
    }
    payload.update(overrides)
    r = client.post(
        f"{REMATES_URL}/{remate_id}/lotes",
        json=payload,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 201, r.text
    return r.json()


def _start_remate_and_open_lote(
    client: TestClient, token: str, remate_id: str, lote_id: str
) -> None:
    headers = {"Authorization": f"Bearer {token}"}
    r = client.post(f"{REMATES_URL}/{remate_id}/schedule", headers=headers)
    assert r.status_code == 200, r.text
    r = client.post(f"{REMATES_URL}/{remate_id}/start", headers=headers)
    assert r.status_code == 200, r.text
    r = client.post(f"{REMATES_URL}/{remate_id}/lotes/{lote_id}/open", headers=headers)
    assert r.status_code == 200, r.text


def _bid(client: TestClient, token: str, remate_id: str, lote_id: str, amount: str) -> dict:
    r = client.post(
        f"{REMATES_URL}/{remate_id}/lotes/{lote_id}/ofertas",
        json={"amount": amount},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 201, r.text
    return r.json()


def _register_owner(client: TestClient, email: str) -> str:
    return _register_and_login(client, email=email, role="rematador")


def _connect_join(client: TestClient, token: str, remate_id: str):
    websocket = client.websocket_connect(WS_URL).__enter__()
    websocket.send_json({"type": "auth", "token": token})
    websocket.receive_json()  # connected
    websocket.send_json({"type": "join_room", "remate_id": remate_id})
    return websocket


async def test_join_room_sends_snapshot_right_after_room_joined(ws_client: TestClient) -> None:
    owner_token = _register_owner(ws_client, "snapws1-owner@example.com")
    remate = _create_remate(ws_client, owner_token)
    lote = _create_lote(ws_client, owner_token, remate["id"])
    _start_remate_and_open_lote(ws_client, owner_token, remate["id"], lote["id"])

    buyer_token = _register_and_login(ws_client, email="snapws1-buyer@example.com")
    websocket = _connect_join(ws_client, buyer_token, remate["id"])
    try:
        joined = _receive_protocol_message(websocket)
        snapshot_msg = _receive_protocol_message(websocket)

        assert joined["type"] == "room_joined"
        assert snapshot_msg["type"] == "snapshot"
        data = snapshot_msg["data"]
        assert data["remate"]["id"] == remate["id"]
        assert data["active_lote"]["id"] == lote["id"]
        assert data["active_lote"]["status"] == "open"
        assert data["winning_offer"] is None
        assert data["recent_offers"] == []
        assert data["connected_users"] == 1
    finally:
        websocket.__exit__(None, None, None)


async def test_snapshot_includes_winning_offer_and_history_over_ws(ws_client: TestClient) -> None:
    owner_token = _register_owner(ws_client, "snapws2-owner@example.com")
    remate = _create_remate(ws_client, owner_token)
    lote = _create_lote(ws_client, owner_token, remate["id"])
    _start_remate_and_open_lote(ws_client, owner_token, remate["id"], lote["id"])

    buyer_token = _register_and_login(ws_client, email="snapws2-buyer@example.com")
    _bid(ws_client, buyer_token, remate["id"], lote["id"], "1000.00")
    _bid(ws_client, buyer_token, remate["id"], lote["id"], "1200.00")

    websocket = _connect_join(ws_client, buyer_token, remate["id"])
    try:
        _receive_protocol_message(websocket)  # room_joined
        snapshot_msg = _receive_protocol_message(websocket)

        data = snapshot_msg["data"]
        assert data["winning_offer"]["amount"] == "1200.00"
        assert len(data["recent_offers"]) == 2
        assert data["recent_offers"][0]["amount"] == "1200.00"
    finally:
        websocket.__exit__(None, None, None)


async def test_snapshot_masks_reserve_price_for_non_owner_over_ws(ws_client: TestClient) -> None:
    owner_token = _register_owner(ws_client, "snapws3-owner@example.com")
    remate = _create_remate(ws_client, owner_token)
    lote = _create_lote(ws_client, owner_token, remate["id"], reserve_price="9999.00")
    _start_remate_and_open_lote(ws_client, owner_token, remate["id"], lote["id"])

    buyer_token = _register_and_login(ws_client, email="snapws3-buyer@example.com")

    owner_ws = _connect_join(ws_client, owner_token, remate["id"])
    buyer_ws = _connect_join(ws_client, buyer_token, remate["id"])
    try:
        _receive_protocol_message(owner_ws)  # room_joined
        owner_snapshot = _receive_protocol_message(owner_ws)
        _receive_protocol_message(buyer_ws)  # room_joined
        buyer_snapshot = _receive_protocol_message(buyer_ws)

        assert owner_snapshot["data"]["active_lote"]["reserve_price"] == "9999.00"
        assert buyer_snapshot["data"]["active_lote"]["reserve_price"] is None
    finally:
        owner_ws.__exit__(None, None, None)
        buyer_ws.__exit__(None, None, None)


async def test_join_room_for_nonexistent_remate_sends_snapshot_unavailable_error(
    ws_client: TestClient,
) -> None:
    token = _register_and_login(ws_client, email="snapws4@example.com")
    fake_remate_id = uuid.uuid4()

    with ws_client.websocket_connect(WS_URL) as websocket:
        websocket.send_json({"type": "auth", "token": token})
        websocket.receive_json()  # connected
        websocket.send_json({"type": "join_room", "remate_id": str(fake_remate_id)})

        joined = _receive_protocol_message(websocket)
        error = _receive_protocol_message(websocket)

        # El join a la sala en sí no se deshace ni falla -- ADR-024 sección D ya
        # decidió que RoomManager no valida contra el dominio; ADR-026 lo respeta y
        # solo informa que el snapshot puntual no se pudo construir.
        assert joined["type"] == "room_joined"
        assert error["type"] == "error"
        assert error["code"] == SNAPSHOT_UNAVAILABLE

        room_manager = ws_client.app.state.room_manager
        assert room_manager.connection_count(fake_remate_id) == 1


async def test_snapshot_connected_users_reflects_current_room_size(ws_client: TestClient) -> None:
    owner_token = _register_owner(ws_client, "snapws5-owner@example.com")
    remate = _create_remate(ws_client, owner_token)
    # Un DRAFT solo es visible para el dueño (RemateService._is_visible) -- se programa
    # para que los compradores de este test puedan verlo y el snapshot se construya.
    schedule = ws_client.post(
        f"{REMATES_URL}/{remate['id']}/schedule",
        headers={"Authorization": f"Bearer {owner_token}"},
    )
    assert schedule.status_code == 200, schedule.text

    buyer_1_token = _register_and_login(ws_client, email="snapws5-buyer1@example.com")
    buyer_2_token = _register_and_login(ws_client, email="snapws5-buyer2@example.com")

    ws_1 = _connect_join(ws_client, buyer_1_token, remate["id"])
    try:
        _receive_protocol_message(ws_1)  # room_joined
        first_snapshot = _receive_protocol_message(ws_1)
        assert first_snapshot["data"]["connected_users"] == 1

        ws_2 = _connect_join(ws_client, buyer_2_token, remate["id"])
        try:
            _receive_protocol_message(ws_2)  # room_joined
            second_snapshot = _receive_protocol_message(ws_2)
            assert second_snapshot["data"]["connected_users"] == 2
        finally:
            ws_2.__exit__(None, None, None)
    finally:
        ws_1.__exit__(None, None, None)


# --- Presencia (Épica 6, Módulo 6.2) ----------------------------------------------------


def _receive_domain_event(websocket, event_type: str, *, matching: dict | None = None) -> dict:
    """Sigue leyendo del socket hasta encontrar un `domain_event` del `event_type`
    pedido (y, si se pasa `matching`, cuyo `payload` coincida en esos campos) --
    razonamiento inverso al de `_receive_protocol_message`: acá SÍ nos interesa el
    evento de presencia, pero puede llegar detrás de otro (por ejemplo, el propio
    `presencia.usuario_conectado` de esta misma conexión, que puede seguir sin leerse en
    la cola). No hay timeout: se asume que Redis (local, en Docker) entrega de forma
    confiable, igual que el resto de la suite (`test_realtime_sync.py`)."""
    while True:
        message = websocket.receive_json()
        if message.get("type") != "domain_event" or message.get("event_type") != event_type:
            continue
        if matching and any(message["payload"].get(k) != v for k, v in matching.items()):
            continue
        return message


async def test_join_room_broadcasts_presence_connected_to_existing_room_members(
    ws_client: TestClient,
) -> None:
    token_a = _register_and_login(ws_client, email="presence1a@example.com")
    token_b = _register_and_login(ws_client, email="presence1b@example.com")
    remate_id = uuid.uuid4()

    with ws_client.websocket_connect(WS_URL) as ws_a:
        ws_a.send_json({"type": "auth", "token": token_a})
        ws_a.receive_json()  # connected
        ws_a.send_json({"type": "join_room", "remate_id": str(remate_id)})
        _receive_protocol_message(ws_a)  # room_joined
        _drain_join_room_extras(ws_a)  # snapshot o snapshot_unavailable

        with ws_client.websocket_connect(WS_URL) as ws_b:
            ws_b.send_json({"type": "auth", "token": token_b})
            connected_b = ws_b.receive_json()
            ws_b.send_json({"type": "join_room", "remate_id": str(remate_id)})
            _receive_protocol_message(ws_b)  # room_joined
            _drain_join_room_extras(ws_b)  # snapshot o snapshot_unavailable

            event = _receive_domain_event(
                ws_a,
                "presencia.usuario_conectado",
                matching={"connection_id": connected_b["connection_id"]},
            )

            assert event["remate_id"] == str(remate_id)
            assert event["payload"]["user_id"] == connected_b["user_id"]
            assert event["payload"]["connected_users"] == 2


async def test_idempotent_rejoin_does_not_broadcast_a_second_presence_event(
    ws_client: TestClient,
) -> None:
    observer_token = _register_and_login(ws_client, email="presence2-observer@example.com")
    actor_token = _register_and_login(ws_client, email="presence2-actor@example.com")
    remate_id = uuid.uuid4()

    with ws_client.websocket_connect(WS_URL) as observer:
        observer.send_json({"type": "auth", "token": observer_token})
        observer.receive_json()  # connected
        observer.send_json({"type": "join_room", "remate_id": str(remate_id)})
        _receive_protocol_message(observer)  # room_joined
        _drain_join_room_extras(observer)  # snapshot o snapshot_unavailable

        with ws_client.websocket_connect(WS_URL) as actor:
            actor.send_json({"type": "auth", "token": actor_token})
            connected_actor = actor.receive_json()
            actor.send_json({"type": "join_room", "remate_id": str(remate_id)})
            _receive_protocol_message(actor)  # room_joined
            _drain_join_room_extras(actor)  # snapshot o snapshot_unavailable

            _receive_domain_event(
                observer,
                "presencia.usuario_conectado",
                matching={"connection_id": connected_actor["connection_id"]},
            )

            # Re-join idempotente a la misma sala -- no debería generar un segundo
            # evento de presencia (ver PresenceService.join_room).
            actor.send_json({"type": "join_room", "remate_id": str(remate_id)})
            rejoin_response = _receive_protocol_message(actor)
            assert rejoin_response["type"] == "room_joined"

            # Verificado con el próximo evento real que sí ocurre (leave), que llega
            # con connected_users == 1: si el re-join hubiera publicado de nuevo, el
            # contador de un segundo "conectado" habría quedado en un estado
            # inconsistente antes de este leave.
            actor.send_json({"type": "leave_room"})
            leave_event = _receive_domain_event(
                observer,
                "presencia.usuario_desconectado",
                matching={"connection_id": connected_actor["connection_id"]},
            )
            assert leave_event["payload"]["connected_users"] == 1


async def test_leave_room_broadcasts_presence_disconnected_to_remaining_room_members(
    ws_client: TestClient,
) -> None:
    token_a = _register_and_login(ws_client, email="presence3a@example.com")
    token_b = _register_and_login(ws_client, email="presence3b@example.com")
    remate_id = uuid.uuid4()

    with ws_client.websocket_connect(WS_URL) as ws_a:
        ws_a.send_json({"type": "auth", "token": token_a})
        ws_a.receive_json()  # connected
        ws_a.send_json({"type": "join_room", "remate_id": str(remate_id)})
        _receive_protocol_message(ws_a)  # room_joined
        _drain_join_room_extras(ws_a)  # snapshot o snapshot_unavailable

        with ws_client.websocket_connect(WS_URL) as ws_b:
            ws_b.send_json({"type": "auth", "token": token_b})
            connected_b = ws_b.receive_json()
            ws_b.send_json({"type": "join_room", "remate_id": str(remate_id)})
            _receive_protocol_message(ws_b)  # room_joined
            _drain_join_room_extras(ws_b)  # snapshot o snapshot_unavailable
            _receive_domain_event(
                ws_a,
                "presencia.usuario_conectado",
                matching={"connection_id": connected_b["connection_id"]},
            )

            ws_b.send_json({"type": "leave_room"})
            _receive_protocol_message(ws_b)  # room_left

            event = _receive_domain_event(
                ws_a,
                "presencia.usuario_desconectado",
                matching={"connection_id": connected_b["connection_id"]},
            )
            assert event["payload"]["connected_users"] == 1


async def test_client_disconnect_without_leave_room_broadcasts_presence_disconnected(
    ws_client: TestClient,
) -> None:
    """Cubre el `finally` del endpoint principal (`app/websocket/router.py`) -- una
    desconexión abrupta (cierre de pestaña, red caída) también debe avisar a la sala,
    no solo un `leave_room` explícito."""
    token_a = _register_and_login(ws_client, email="presence4a@example.com")
    token_b = _register_and_login(ws_client, email="presence4b@example.com")
    remate_id = uuid.uuid4()

    with ws_client.websocket_connect(WS_URL) as ws_a:
        ws_a.send_json({"type": "auth", "token": token_a})
        ws_a.receive_json()  # connected
        ws_a.send_json({"type": "join_room", "remate_id": str(remate_id)})
        _receive_protocol_message(ws_a)  # room_joined
        _drain_join_room_extras(ws_a)  # snapshot o snapshot_unavailable

        with ws_client.websocket_connect(WS_URL) as ws_b:
            ws_b.send_json({"type": "auth", "token": token_b})
            connected_b = ws_b.receive_json()
            ws_b.send_json({"type": "join_room", "remate_id": str(remate_id)})
            _receive_protocol_message(ws_b)  # room_joined
            _drain_join_room_extras(ws_b)  # snapshot o snapshot_unavailable
            _receive_domain_event(
                ws_a,
                "presencia.usuario_conectado",
                matching={"connection_id": connected_b["connection_id"]},
            )
            # ws_b se desconecta acá (fin del `with` interno), sin mandar `leave_room`.

        event = _receive_domain_event(
            ws_a,
            "presencia.usuario_desconectado",
            matching={"connection_id": connected_b["connection_id"]},
        )
        assert event["payload"]["connected_users"] == 1


async def test_snapshot_connected_users_detail_present_for_owner_masked_for_buyer_over_ws(
    ws_client: TestClient,
) -> None:
    owner_token = _register_owner(ws_client, "presence5-owner@example.com")
    remate = _create_remate(ws_client, owner_token)
    schedule = ws_client.post(
        f"{REMATES_URL}/{remate['id']}/schedule",
        headers={"Authorization": f"Bearer {owner_token}"},
    )
    assert schedule.status_code == 200, schedule.text

    buyer_token = _register_and_login(ws_client, email="presence5-buyer@example.com")

    owner_ws = _connect_join(ws_client, owner_token, remate["id"])
    try:
        _receive_protocol_message(owner_ws)  # room_joined
        owner_snapshot = _receive_protocol_message(owner_ws)

        assert owner_snapshot["data"]["connected_users_detail"] is not None
        assert len(owner_snapshot["data"]["connected_users_detail"]) == 1

        buyer_ws = _connect_join(ws_client, buyer_token, remate["id"])
        try:
            _receive_protocol_message(buyer_ws)  # room_joined
            buyer_snapshot = _receive_protocol_message(buyer_ws)

            assert buyer_snapshot["data"]["connected_users"] == 2
            assert buyer_snapshot["data"]["connected_users_detail"] is None
        finally:
            buyer_ws.__exit__(None, None, None)
    finally:
        owner_ws.__exit__(None, None, None)
