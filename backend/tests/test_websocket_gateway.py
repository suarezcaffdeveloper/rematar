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
from app.websocket import close_codes
from app.websocket.rooms import ERROR_ALREADY_IN_ROOM, ERROR_INVALID_ROOM_ID, ERROR_NOT_IN_ROOM

WS_URL = "/api/v1/ws"
REGISTER_URL = "/api/v1/auth/register"
LOGIN_URL = "/api/v1/auth/login"


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

    app = create_app()
    app.dependency_overrides[get_db] = _override_get_db

    if settings_overrides:
        base_settings = get_settings()
        custom_settings = base_settings.model_copy(update=settings_overrides)
        app.dependency_overrides[get_settings] = lambda: custom_settings

    return app


def _register_and_login(client: TestClient, *, email: str, role: str = "comprador") -> str:
    client.post(
        REGISTER_URL,
        json={"email": email, "password": "password123", "full_name": "Test", "role": role},
    )
    login = client.post(LOGIN_URL, data={"username": email, "password": "password123"})
    assert login.status_code == 200, login.text
    return login.json()["access_token"]


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
        response = websocket.receive_json()

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

        websocket.send_json({"type": "join_room", "remate_id": str(room_b)})
        response = websocket.receive_json()

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
        first = websocket.receive_json()
        websocket.send_json({"type": "join_room", "remate_id": str(remate_id)})
        second = websocket.receive_json()

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

        websocket.send_json({"type": "leave_room"})
        response = websocket.receive_json()

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

        websocket.send_json({"type": "leave_room"})
        websocket.receive_json()  # room_left

        websocket.send_json({"type": "join_room", "remate_id": str(room_b)})
        response = websocket.receive_json()

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

            ping = websocket.receive_json()
            assert ping["type"] == "ping"
            websocket.send_json({"type": "pong"})

            room_manager = app.state.room_manager
            connection_id = uuid.UUID(connected["connection_id"])
            assert room_manager.room_id_for_connection(connection_id) == remate_id
            assert room_manager.connection_count(remate_id) == 1
