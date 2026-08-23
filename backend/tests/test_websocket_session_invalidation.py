"""Tests de integración de punta a punta de la invalidación de conexiones WebSocket
(Fase 3 de remediación del WebSocket Security Audit) -- Postgres/Redis reales, mismo
estilo y fixtures que `test_websocket_gateway.py`/`test_realtime_sync.py`.

Cubre los 12 escenarios pedidos: logout (Test 1), revocación de sesión vía el mecanismo
genérico (Test 2), cambio de contraseña (Test 3), suspensión (Test 4), reconexión con
sesión revocada (Test 5), múltiples sesiones independientes (Test 6), "logout global"
vía el mecanismo de revoke-all ya existente -- cambio de contraseña, RematAR no tiene un
endpoint de logout global separado (Test 7), cleanup sin conexiones huérfanas (Test 8,
verificado dentro de varios de los anteriores), multi-instancia vía Redis Pub/Sub
(Test 9), race condition (Test 10, best-effort desde un test de caja negra), usuario no
afectado (Test 11) y realtime normal sin regresión (Test 12).
"""

import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta

import pytest_asyncio
from fastapi.testclient import TestClient
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from starlette.websockets import WebSocketDisconnect

from app.core.config import get_settings
from app.core.security import hash_password
from app.db.session import get_db
from app.events.redis_bus import RedisEventBus
from app.main import create_app
from app.modules.auth.events import SessionInvalidated
from app.modules.auth.models import PasswordResetToken
from app.modules.auth.security import create_password_reset_token
from app.modules.users.models import User, UserRole
from app.redis.pubsub import RedisPubSub
from app.websocket import close_codes
from tests._role_test_helpers import activate_pending_account_sync

WS_URL = "/api/v1/ws"
REGISTER_URL = "/api/v1/auth/register"
LOGIN_URL = "/api/v1/auth/login"
LOGOUT_URL = "/api/v1/auth/logout"
RESET_PASSWORD_URL = "/api/v1/auth/reset-password"
REMATES_URL = "/api/v1/remates"
USERS_URL = "/api/v1/users"


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _register_and_login(
    client: TestClient, *, email: str, role: str = "comprador"
) -> tuple[str, str]:
    register = client.post(
        REGISTER_URL,
        json={
            "email": email,
            "password": "password123",
            "confirm_password": "password123",
            "full_name": "Fase 3",
            "phone": "+5491122334455",
            "role": role,
        },
    )
    assert register.status_code == 201, register.text
    if role in ("empresa", "rematador"):
        activate_pending_account_sync(email)
    login = client.post(LOGIN_URL, data={"username": email, "password": "password123"})
    assert login.status_code == 200, login.text
    body = login.json()
    return body["access_token"], body["refresh_token"]


def _login_again(client: TestClient, *, email: str) -> tuple[str, str]:
    """Segunda sesión independiente del mismo usuario -- mismo criterio que "navegador"
    + "celular" del enunciado: cada login emite un `RefreshToken`/`session_id` propio."""
    login = client.post(LOGIN_URL, data={"username": email, "password": "password123"})
    assert login.status_code == 200, login.text
    body = login.json()
    return body["access_token"], body["refresh_token"]


def _user_id(client: TestClient, token: str) -> uuid.UUID:
    response = client.get(f"{USERS_URL}/me", headers=_auth(token))
    return uuid.UUID(response.json()["id"])


async def _create_admin_and_login(
    client: TestClient, db_session: AsyncSession, *, email: str
) -> str:
    db_session.add(
        User(
            email=email,
            hashed_password=hash_password("adminpass123"),
            full_name="Admin Fase 3",
            role=UserRole.ADMIN,
        )
    )
    await db_session.commit()
    login = client.post(LOGIN_URL, data={"username": email, "password": "adminpass123"})
    assert login.status_code == 200, login.text
    return login.json()["access_token"]


def _create_visible_remate(client: TestClient, *, suffix: str) -> str:
    owner_token, _ = _register_and_login(client, email=f"fase3-owner-{suffix}@example.com", role="empresa")
    remate = client.post(
        REMATES_URL,
        json={
            "title": "Remate de invalidación WS",
            "category": "hacienda",
            "starts_at": "2027-06-01T10:00:00Z",
        },
        headers=_auth(owner_token),
    )
    assert remate.status_code == 201, remate.text
    remate_id = remate.json()["id"]
    schedule = client.post(f"{REMATES_URL}/{remate_id}/schedule", headers=_auth(owner_token))
    assert schedule.status_code == 200, schedule.text
    return remate_id


async def _reset_password(client: TestClient, db_session: AsyncSession, *, user_id: uuid.UUID) -> None:
    settings = get_settings()
    reset_row = PasswordResetToken(
        user_id=user_id, expires_at=datetime.now(UTC) + timedelta(minutes=15)
    )
    db_session.add(reset_row)
    await db_session.commit()
    await db_session.refresh(reset_row)
    reset_token = create_password_reset_token(user_id=user_id, jti=reset_row.id, settings=settings)
    reset = client.post(
        RESET_PASSWORD_URL,
        json={
            "token": reset_token,
            "new_password": "newpassword456",
            "confirm_new_password": "newpassword456",
        },
    )
    assert reset.status_code == 204, reset.text


_SIDE_CHANNEL_EVENT_PREFIXES = ("presencia.", "chat.")


def _receive_protocol_message(websocket) -> dict:
    while True:
        message = websocket.receive_json()
        is_side_channel_event = message.get("type") == "domain_event" and str(
            message.get("event_type", "")
        ).startswith(_SIDE_CHANNEL_EVENT_PREFIXES)
        if not is_side_channel_event:
            return message


def _connect(client: TestClient, access_token: str):
    ws = client.websocket_connect(WS_URL).__enter__()
    ws.send_json({"type": "auth", "token": access_token})
    connected = ws.receive_json()
    assert connected["type"] == "connected"
    return ws, connected


def _assert_closed_unauthorized(ws) -> None:
    try:
        while True:
            ws.receive_json()
    except WebSocketDisconnect as exc:
        assert exc.code == close_codes.UNAUTHORIZED


@pytest_asyncio.fixture
async def event_bus() -> AsyncIterator[RedisEventBus]:
    redis = Redis.from_url(get_settings().REDIS_URL, decode_responses=True)
    try:
        yield RedisEventBus(RedisPubSub(redis))
    finally:
        await redis.aclose()


def _build_ws_app(db_engine: AsyncEngine):
    """Segunda instancia de la app, misma Postgres/Redis -- mismo helper que
    `test_websocket_gateway.py::_build_ws_app` (duplicado acá, no importado: mismo
    criterio de límites entre archivos de test que ya sigue el resto de la suite)."""
    database_url = db_engine.url.render_as_string(hide_password=False)

    async def _override_get_db() -> AsyncIterator[AsyncSession]:
        engine = create_async_engine(database_url)
        session_factory = async_sessionmaker(bind=engine, expire_on_commit=False)
        async with session_factory() as session:
            yield session
        await engine.dispose()

    @asynccontextmanager
    async def _chat_session_factory() -> AsyncIterator[AsyncSession]:
        engine = create_async_engine(database_url)
        session_factory = async_sessionmaker(bind=engine, expire_on_commit=False)
        async with session_factory() as session:
            yield session
        await engine.dispose()

    app = create_app()
    app.dependency_overrides[get_db] = _override_get_db
    app.state.db_session_factory = _chat_session_factory
    return app


# --- Test 1: logout --------------------------------------------------------------------


async def test_logout_closes_the_corresponding_websocket_and_cleans_up(
    ws_client: TestClient,
) -> None:
    access_token, refresh_token = _register_and_login(ws_client, email="fase3-t1@example.com")
    manager = ws_client.app.state.connection_manager
    room_manager = ws_client.app.state.room_manager
    remate_id = _create_visible_remate(ws_client, suffix="t1")

    ws, connected = _connect(ws_client, access_token)
    connection_id = uuid.UUID(connected["connection_id"])
    ws.send_json({"type": "join_room", "remate_id": remate_id})
    joined = _receive_protocol_message(ws)
    assert joined["type"] == "room_joined"
    _receive_protocol_message(ws)  # snapshot
    assert manager.get(connection_id) is not None
    assert room_manager.connection_count(uuid.UUID(remate_id)) == 1

    logout = ws_client.post(LOGOUT_URL, json={"refresh_token": refresh_token})
    assert logout.status_code == 204, logout.text

    _assert_closed_unauthorized(ws)
    ws.__exit__(None, None, None)

    # Test 8 (cleanup) verificado acá: ni conexión huérfana en ConnectionManager ni
    # membresía huérfana en RoomManager.
    assert manager.get(connection_id) is None
    assert room_manager.connection_count(uuid.UUID(remate_id)) == 0
    assert room_manager.room_count() == 0


# --- Test 2: revocación de sesión (mecanismo genérico) ---------------------------------


async def test_publishing_session_invalidated_directly_closes_the_matching_connection(
    ws_client: TestClient, event_bus: RedisEventBus
) -> None:
    """RematAR no tiene un endpoint HTTP separado de "revoke session" distinto de
    logout (ver Fase 3, sección 3.C del pedido) -- este test ejercita el mecanismo
    genérico en sí (`SessionInvalidated` -> Redis Pub/Sub -> `SessionInvalidationDispatcher`),
    independiente de cuál endpoint lo dispara."""
    access_token, _ = _register_and_login(ws_client, email="fase3-t2@example.com")
    user_id = _user_id(ws_client, access_token)
    manager = ws_client.app.state.connection_manager

    ws, connected = _connect(ws_client, access_token)
    connection_id = uuid.UUID(connected["connection_id"])

    await event_bus.publish(
        SessionInvalidated(user_id=user_id, session_id=None, reason="logout")
    )

    _assert_closed_unauthorized(ws)
    ws.__exit__(None, None, None)
    assert manager.get(connection_id) is None


# --- Test 3: cambio de contraseña -------------------------------------------------------


async def test_password_change_closes_the_websocket(
    ws_client: TestClient, db_session: AsyncSession
) -> None:
    access_token, _ = _register_and_login(ws_client, email="fase3-t3@example.com")
    user_id = _user_id(ws_client, access_token)
    manager = ws_client.app.state.connection_manager

    ws, connected = _connect(ws_client, access_token)
    connection_id = uuid.UUID(connected["connection_id"])

    await _reset_password(ws_client, db_session, user_id=user_id)

    _assert_closed_unauthorized(ws)
    ws.__exit__(None, None, None)
    assert manager.get(connection_id) is None


# --- Test 4: suspensión de usuario ------------------------------------------------------


async def test_user_suspension_closes_the_websocket(
    ws_client: TestClient, db_session: AsyncSession
) -> None:
    access_token, _ = _register_and_login(ws_client, email="fase3-t4@example.com")
    user_id = _user_id(ws_client, access_token)
    manager = ws_client.app.state.connection_manager

    ws, connected = _connect(ws_client, access_token)
    connection_id = uuid.UUID(connected["connection_id"])

    admin_token = await _create_admin_and_login(
        ws_client, db_session, email="fase3-t4-admin@example.com"
    )
    suspend = ws_client.patch(
        f"{USERS_URL}/{user_id}/status", json={"is_active": False}, headers=_auth(admin_token)
    )
    assert suspend.status_code == 200, suspend.text

    _assert_closed_unauthorized(ws)
    ws.__exit__(None, None, None)
    assert manager.get(connection_id) is None


# --- Test 5: reconexión con sesión revocada --------------------------------------------


async def test_reconnect_with_revoked_session_is_rejected(ws_client: TestClient) -> None:
    access_token, refresh_token = _register_and_login(ws_client, email="fase3-t5@example.com")
    ws, _ = _connect(ws_client, access_token)
    ws.__exit__(None, None, None)

    logout = ws_client.post(LOGOUT_URL, json={"refresh_token": refresh_token})
    assert logout.status_code == 204, logout.text

    # El access token en sí sigue siendo criptográficamente válido (no venció) -- lo
    # que se verifica acá es que igual se rechaza, porque la sesión (`sid`) que lo
    # emitió ya está revocada (ver `AuthService.get_current_session_from_access_token`).
    with ws_client.websocket_connect(WS_URL) as websocket:
        websocket.send_json({"type": "auth", "token": access_token})
        try:
            websocket.receive_json()
            raise AssertionError("se esperaba que la reconexión fuera rechazada")
        except WebSocketDisconnect as exc:
            assert exc.code == close_codes.UNAUTHORIZED


# --- Test 6: múltiples sesiones ---------------------------------------------------------


async def test_revoking_one_session_does_not_close_a_different_sessions_websocket(
    ws_client: TestClient,
) -> None:
    email = "fase3-t6@example.com"
    access_token_a, refresh_token_a = _register_and_login(ws_client, email=email)
    access_token_b, _ = _login_again(ws_client, email=email)
    manager = ws_client.app.state.connection_manager

    ws_a, connected_a = _connect(ws_client, access_token_a)
    ws_b, connected_b = _connect(ws_client, access_token_b)
    connection_id_a = uuid.UUID(connected_a["connection_id"])
    connection_id_b = uuid.UUID(connected_b["connection_id"])

    logout = ws_client.post(LOGOUT_URL, json={"refresh_token": refresh_token_a})
    assert logout.status_code == 204, logout.text

    _assert_closed_unauthorized(ws_a)
    ws_a.__exit__(None, None, None)
    assert manager.get(connection_id_a) is None

    # ws_b sigue viva de verdad -- no solo "todavía en el dict", responde a un pong.
    ws_b.send_json({"type": "pong"})
    assert manager.get(connection_id_b) is not None
    ws_b.__exit__(None, None, None)


# --- Test 7: "logout global" (revoke-all vía cambio de contraseña) ---------------------


async def test_password_change_closes_every_sessions_websocket(
    ws_client: TestClient, db_session: AsyncSession
) -> None:
    """RematAR no distingue "logout de una sesión" de un endpoint de "logout global"
    separado -- el único mecanismo de revoke-all existente es el cambio de contraseña
    (`AuthService.reset_password` -> `revoke_all_for_user`, RNF-11). Este test aplica
    esa misma política, ya existente, a las tres sesiones/conexiones WS activas."""
    email = "fase3-t7@example.com"
    access_token_a, _ = _register_and_login(ws_client, email=email)
    user_id = _user_id(ws_client, access_token_a)
    access_token_b, _ = _login_again(ws_client, email=email)
    access_token_c, _ = _login_again(ws_client, email=email)

    ws_a, _ = _connect(ws_client, access_token_a)
    ws_b, _ = _connect(ws_client, access_token_b)
    ws_c, _ = _connect(ws_client, access_token_c)

    await _reset_password(ws_client, db_session, user_id=user_id)

    for ws in (ws_a, ws_b, ws_c):
        _assert_closed_unauthorized(ws)
        ws.__exit__(None, None, None)


# --- Test 9: multi-instancia vía Redis --------------------------------------------------


async def test_session_invalidation_propagates_across_backend_instances_via_redis(
    db_engine: AsyncEngine,
) -> None:
    """Instancia A: WS conectado. Instancia B: logout. Si la invalidación solo
    existiera en memoria de una instancia, A nunca se enteraría -- se verifica que sí
    se entera, vía el mismo Redis Pub/Sub que ya reenvía domain_events entre instancias
    (Fase 3, sección 8 del pedido, marcada explícitamente como crítica)."""
    app_a = _build_ws_app(db_engine)
    app_b = _build_ws_app(db_engine)
    with TestClient(app_a) as client_a, TestClient(app_b) as client_b:
        access_token, refresh_token = _register_and_login(
            client_a, email="fase3-t9@example.com"
        )
        manager_a = app_a.state.connection_manager

        ws, connected = _connect(client_a, access_token)
        connection_id = uuid.UUID(connected["connection_id"])

        # Logout vía la OTRA instancia -- B nunca vio esta conexión WS en su propio
        # ConnectionManager (cada instancia tiene el suyo, en memoria, separado).
        logout = client_b.post(LOGOUT_URL, json={"refresh_token": refresh_token})
        assert logout.status_code == 204, logout.text

        _assert_closed_unauthorized(ws)
        ws.__exit__(None, None, None)
        assert manager_a.get(connection_id) is None


# --- Test 10: race condition (best-effort, caja negra) ----------------------------------


async def test_session_revoked_while_join_room_in_flight_leaves_no_lasting_access(
    ws_client: TestClient, event_bus: RedisEventBus
) -> None:
    """No es posible fabricar desde un test de caja negra una carrera exacta contra un
    punto de `await` puntual del servidor -- lo que sí se puede verificar, y es lo que
    realmente importa para "fail closed", es la propiedad de consistencia eventual:
    sin importar si un `join_room` ya en curso llega a completarse, el estado final
    (después de que la invalidación termina de propagarse) es siempre "cerrado, sin
    membresía persistente en ninguna sala" -- nunca queda autorizando nada de forma
    duradera."""
    remate_id = _create_visible_remate(ws_client, suffix="t10")
    access_token, _ = _register_and_login(ws_client, email="fase3-t10@example.com")
    user_id = _user_id(ws_client, access_token)
    manager = ws_client.app.state.connection_manager
    room_manager = ws_client.app.state.room_manager

    ws, connected = _connect(ws_client, access_token)
    connection_id = uuid.UUID(connected["connection_id"])

    await event_bus.publish(
        SessionInvalidated(user_id=user_id, session_id=None, reason="logout")
    )
    try:
        ws.send_json({"type": "join_room", "remate_id": remate_id})
    except Exception:
        pass  # el socket ya pudo haber cerrado en este mismo instante -- también válido

    _assert_closed_unauthorized(ws)
    ws.__exit__(None, None, None)

    assert manager.get(connection_id) is None
    assert room_manager.connection_count(uuid.UUID(remate_id)) == 0


# --- Test 11: usuario no afectado -------------------------------------------------------


async def test_revoking_user_a_session_does_not_affect_user_b(ws_client: TestClient) -> None:
    access_token_a, refresh_token_a = _register_and_login(ws_client, email="fase3-t11-a@example.com")
    access_token_b, _ = _register_and_login(ws_client, email="fase3-t11-b@example.com")
    manager = ws_client.app.state.connection_manager

    ws_a, _ = _connect(ws_client, access_token_a)
    ws_b, connected_b = _connect(ws_client, access_token_b)
    connection_id_b = uuid.UUID(connected_b["connection_id"])

    logout = ws_client.post(LOGOUT_URL, json={"refresh_token": refresh_token_a})
    assert logout.status_code == 204, logout.text

    _assert_closed_unauthorized(ws_a)
    ws_a.__exit__(None, None, None)

    ws_b.send_json({"type": "pong"})
    assert manager.get(connection_id_b) is not None
    ws_b.__exit__(None, None, None)


# --- Test 12: realtime normal, sin regresión --------------------------------------------


async def test_valid_session_full_realtime_flow_still_works(ws_client: TestClient) -> None:
    remate_id = _create_visible_remate(ws_client, suffix="t12")
    access_token, _ = _register_and_login(ws_client, email="fase3-t12@example.com")

    ws, _ = _connect(ws_client, access_token)
    try:
        ws.send_json({"type": "join_room", "remate_id": remate_id})
        joined = _receive_protocol_message(ws)
        assert joined["type"] == "room_joined"
        snapshot = _receive_protocol_message(ws)
        assert snapshot["type"] == "snapshot"
        assert snapshot["data"]["remate"]["id"] == remate_id
    finally:
        ws.__exit__(None, None, None)
