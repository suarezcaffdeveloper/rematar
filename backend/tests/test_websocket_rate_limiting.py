"""Tests de Rate Limiting y protección DoS del Gateway WebSocket (Fase 4 de remediación
del WebSocket Security Audit). Ver app/websocket/rate_limit.py y el docstring de
`app/websocket/router.py` (sección "Rate limiting y protección DoS").

Mismo criterio de conexión a la base que `tests/test_websocket_gateway.py`
(`TestClient` de Starlette, no `AsyncClient`/`ASGITransport`) -- ver
docs/adr/ADR-023-gateway-websocket.md, sección E.

## Por qué cada test usa una IP falsa distinta

`websocket.client.host` es la identidad que usa el límite por IP (`ip_connect_key`).
`TestClient` por default simula siempre la misma tupla `("testclient", 50000)` para
toda conexión -- perfecto para *un* test que quiere que todas sus conexiones compartan
IP, pero un problema si dos tests DISTINTOS de este archivo comparten esa misma IP falsa
sin que la ventana del rate limit haya expirado entre uno y otro (Redis no se limpia
entre tests, a diferencia de Postgres/`MEDIA_ROOT` -- ver `tests/conftest.py`). Cada
test que ejercita el límite por IP arma su propia IP falsa con un sufijo random
(`_fake_ip()`) para no pisarse con otros tests ni con corridas anteriores.
"""

import json
import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi.testclient import TestClient
from redis.exceptions import RedisError
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
from app.websocket.rate_limit import WSRateLimiter
from app.websocket.rooms import ERROR_RATE_LIMITED
from tests._role_test_helpers import activate_pending_account_sync

WS_URL = "/api/v1/ws"
REGISTER_URL = "/api/v1/auth/register"
LOGIN_URL = "/api/v1/auth/login"
REMATES_URL = "/api/v1/remates"


def _fake_ip() -> str:
    """Ver docstring del módulo -- nunca una IP real, un string único por uso."""
    return f"test-ip-{uuid.uuid4().hex}"


def _build_ws_app(db_engine: AsyncEngine, **settings_overrides):
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
    if role in ("empresa", "rematador"):
        activate_pending_account_sync(email)
    login = client.post(LOGIN_URL, data={"username": email, "password": "password123"})
    assert login.status_code == 200, login.text
    return login.json()["access_token"]


def _create_visible_remate(client: TestClient, *, suffix: str) -> str:
    owner_token = _register_and_login(
        client, email=f"rl-room-owner-{suffix}@example.com", role="empresa"
    )
    r = client.post(
        REMATES_URL,
        json={
            "title": "Remate de rate limiting",
            "category": "hacienda",
            "starts_at": "2027-06-01T10:00:00Z",
        },
        headers={"Authorization": f"Bearer {owner_token}"},
    )
    assert r.status_code == 201, r.text
    remate_id = r.json()["id"]
    r = client.post(
        f"{REMATES_URL}/{remate_id}/schedule",
        headers={"Authorization": f"Bearer {owner_token}"},
    )
    assert r.status_code == 200, r.text
    return remate_id


_SIDE_CHANNEL_EVENT_PREFIXES = ("presencia.", "chat.")


def _receive_protocol_message(websocket) -> dict:
    while True:
        message = websocket.receive_json()
        is_side_channel_event = message.get("type") == "domain_event" and str(
            message.get("event_type", "")
        ).startswith(_SIDE_CHANNEL_EVENT_PREFIXES)
        if not is_side_channel_event:
            return message


def _receive_domain_event(websocket, event_type: str) -> dict:
    while True:
        message = websocket.receive_json()
        if message.get("type") == "domain_event" and message.get("event_type") == event_type:
            return message


# --- Test 1: límite general de mensajes por conexión -----------------------------------


async def test_message_flood_closes_connection_with_rate_limited(db_engine: AsyncEngine) -> None:
    app = _build_ws_app(
        db_engine, WS_MESSAGE_RATE_LIMIT_MAX=3, WS_MESSAGE_RATE_LIMIT_WINDOW_SECONDS=30
    )
    with TestClient(app, client=(_fake_ip(), 50000)) as client:
        token = _register_and_login(client, email="rl-msgflood@example.com")
        with client.websocket_connect(WS_URL) as websocket:
            websocket.send_json({"type": "auth", "token": token})
            websocket.receive_json()  # connected

            for _ in range(4):  # 1 más que el límite
                websocket.send_json({"type": "pong"})

            try:
                websocket.receive_json()
                raise AssertionError("se esperaba que la conexión se cerrara por rate limit")
            except WebSocketDisconnect as exc:
                assert exc.code == close_codes.RATE_LIMITED


# --- Test 2: tráfico normal sigue funcionando exactamente igual ------------------------


async def test_normal_traffic_is_not_affected_by_rate_limiting(ws_client: TestClient) -> None:
    """Sin overrides de settings -- límites de producción por default. auth -> join_room
    -> snapshot -> heartbeat, la misma secuencia que ya verifica
    `test_websocket_gateway.py`, para confirmar que la Fase 4 no le agrega fricción al
    camino feliz."""
    token = _register_and_login(ws_client, email="rl-normal@example.com")
    remate_id = _create_visible_remate(ws_client, suffix="normal")

    with ws_client.websocket_connect(WS_URL) as websocket:
        websocket.send_json({"type": "auth", "token": token})
        connected = websocket.receive_json()
        assert connected["type"] == "connected"

        websocket.send_json({"type": "join_room", "remate_id": remate_id})
        joined = _receive_protocol_message(websocket)
        assert joined["type"] == "room_joined"

        snapshot = _receive_protocol_message(websocket)
        assert snapshot["type"] == "snapshot"

        websocket.send_json({"type": "leave_room"})
        left = _receive_protocol_message(websocket)
        assert left["type"] == "room_left"


# --- Test 3: spam de join_room queda limitado -------------------------------------------


async def test_join_room_spam_is_rate_limited(db_engine: AsyncEngine) -> None:
    app = _build_ws_app(
        db_engine, WS_ROOM_ACTION_RATE_LIMIT_MAX=2, WS_ROOM_ACTION_RATE_LIMIT_WINDOW_SECONDS=30
    )
    with TestClient(app, client=(_fake_ip(), 50000)) as client:
        token = _register_and_login(client, email="rl-joinspam@example.com")
        with client.websocket_connect(WS_URL) as websocket:
            websocket.send_json({"type": "auth", "token": token})
            websocket.receive_json()  # connected

            # Las primeras dos (dentro del límite) se procesan con normalidad -- remates
            # inexistentes a propósito, no importa el dominio para este test, solo que
            # el rate limiter las deje pasar.
            for _ in range(2):
                websocket.send_json({"type": "join_room", "remate_id": str(uuid.uuid4())})
                response = websocket.receive_json()
                assert response["type"] == "error"
                assert response["code"] != ERROR_RATE_LIMITED

            # La tercera supera el límite -- rechazada por el rate limiter, sin llegar a
            # consultar autorización (el código de error lo confirma).
            websocket.send_json({"type": "join_room", "remate_id": str(uuid.uuid4())})
            response = websocket.receive_json()
            assert response["type"] == "error"
            assert response["code"] == ERROR_RATE_LIMITED

            # La conexión sigue viva -- un abuso de join_room es recuperable, no cierra.
            websocket.send_json({"type": "pong"})


# --- Test 4: spam de "auth" (después del handshake) queda limitado ---------------------


async def test_repeated_auth_messages_after_handshake_are_rate_limited(
    db_engine: AsyncEngine,
) -> None:
    """`auth` solo se procesa una vez, en el handshake (`authenticate_connection`) --
    cualquier `auth` posterior cae en el mismo despacho por `type` que un mensaje
    desconocido (`_handle_message`, sin rama para "auth"), así que el spam de auth
    dentro de una conexión ya autenticada es, en los hechos, spam de mensajes genérico:
    lo cubre el mismo límite general de mensajes que el Test 1, sin mecanismo aparte."""
    app = _build_ws_app(
        db_engine, WS_MESSAGE_RATE_LIMIT_MAX=3, WS_MESSAGE_RATE_LIMIT_WINDOW_SECONDS=30
    )
    with TestClient(app, client=(_fake_ip(), 50000)) as client:
        token = _register_and_login(client, email="rl-authspam@example.com")
        with client.websocket_connect(WS_URL) as websocket:
            websocket.send_json({"type": "auth", "token": token})
            websocket.receive_json()  # connected

            for _ in range(4):
                websocket.send_json({"type": "auth", "token": token})

            try:
                websocket.receive_json()
                raise AssertionError("se esperaba que la conexión se cerrara por rate limit")
            except WebSocketDisconnect as exc:
                assert exc.code == close_codes.RATE_LIMITED


# --- Test 5: conexiones simultáneas por usuario -----------------------------------------


async def test_per_user_concurrent_connection_limit_rejects_new_connections(
    db_engine: AsyncEngine,
) -> None:
    app = _build_ws_app(db_engine, WS_MAX_CONNECTIONS_PER_USER=2)
    with TestClient(app, client=(_fake_ip(), 50000)) as client:
        token = _register_and_login(client, email="rl-userconn@example.com")

        with client.websocket_connect(WS_URL) as ws_a, client.websocket_connect(WS_URL) as ws_b:
            ws_a.send_json({"type": "auth", "token": token})
            assert ws_a.receive_json()["type"] == "connected"
            ws_b.send_json({"type": "auth", "token": token})
            assert ws_b.receive_json()["type"] == "connected"

            # Tercera conexión del MISMO usuario -- se rechaza, sin afectar a las dos ya
            # abiertas.
            with client.websocket_connect(WS_URL) as ws_c:
                ws_c.send_json({"type": "auth", "token": token})
                try:
                    ws_c.receive_json()
                    raise AssertionError("se esperaba que la tercera conexión se rechazara")
                except WebSocketDisconnect as exc:
                    assert exc.code == close_codes.RATE_LIMITED

            # Las dos conexiones legítimas preexistentes siguen funcionando.
            ws_a.send_json({"type": "pong"})
            ws_b.send_json({"type": "pong"})


# --- Test 6: conexiones nuevas por IP ----------------------------------------------------


async def test_per_ip_connection_rate_limit_rejects_new_connections(db_engine: AsyncEngine) -> None:
    app = _build_ws_app(
        db_engine, WS_IP_CONNECT_RATE_LIMIT_MAX=3, WS_IP_CONNECT_RATE_LIMIT_WINDOW_SECONDS=30
    )
    ip = _fake_ip()
    with TestClient(app, client=(ip, 50000)) as client:
        token = _register_and_login(client, email="rl-ipconn@example.com")

        for _ in range(3):  # dentro del límite -- se conectan con normalidad
            with client.websocket_connect(WS_URL) as websocket:
                websocket.send_json({"type": "auth", "token": token})
                assert websocket.receive_json()["type"] == "connected"

        # Cuarta conexión NUEVA desde la misma IP -- rechazada antes de llegar siquiera
        # a leer el mensaje de auth.
        with client.websocket_connect(WS_URL) as websocket:
            try:
                websocket.receive_json()
                raise AssertionError("se esperaba que la cuarta conexión se rechazara")
            except WebSocketDisconnect as exc:
                assert exc.code == close_codes.RATE_LIMITED


# --- Test 7: frame demasiado grande -------------------------------------------------------


async def test_oversized_message_closes_connection_with_message_too_large(
    db_engine: AsyncEngine,
) -> None:
    # `WS_MAX_MESSAGE_BYTES` tiene que dejar pasar el mensaje "auth" real (un JWT, no un
    # tamaño inventado) pero rechazar el payload inflado de más abajo -- se registra
    # primero con la app SIN el override para conocer el tamaño real del token, y recién
    # después se fija el límite sobre esa misma app (dependency override, no hace falta
    # una segunda app/cliente).
    app = _build_ws_app(db_engine)
    with TestClient(app, client=(_fake_ip(), 50000)) as client:
        token = _register_and_login(client, email="rl-bigframe@example.com")

        max_bytes = len(json.dumps({"type": "auth", "token": token}).encode("utf-8")) + 16
        base_settings = get_settings()
        app.dependency_overrides[get_settings] = lambda: base_settings.model_copy(
            update={"WS_MAX_MESSAGE_BYTES": max_bytes}
        )

        with client.websocket_connect(WS_URL) as websocket:
            websocket.send_json({"type": "auth", "token": token})
            websocket.receive_json()  # connected

            huge_payload = {"type": "join_room", "remate_id": str(uuid.uuid4()), "junk": "x" * 500}
            websocket.send_json(huge_payload)

            try:
                websocket.receive_json()
                raise AssertionError("se esperaba que la conexión se cerrara por tamaño")
            except WebSocketDisconnect as exc:
                assert exc.code == close_codes.MESSAGE_TOO_LARGE


async def test_oversized_first_auth_message_closes_connection_with_message_too_large(
    db_engine: AsyncEngine,
) -> None:
    """Mismo chequeo, pero para el primer mensaje (`app/websocket/auth.py`) -- un
    cliente sin autenticar todavía no debe poder forzar el parseo de un payload enorme."""
    app = _build_ws_app(db_engine, WS_MAX_MESSAGE_BYTES=64)
    with TestClient(app, client=(_fake_ip(), 50000)) as client, client.websocket_connect(
        WS_URL
    ) as websocket:
        websocket.send_json({"type": "auth", "token": "x" * 500})
        try:
            websocket.receive_json()
            raise AssertionError("se esperaba que la conexión se cerrara por tamaño")
        except WebSocketDisconnect as exc:
            assert exc.code == close_codes.MESSAGE_TOO_LARGE


# --- Test 8: abuso de mensajes inválidos queda limitado -----------------------------------


async def test_invalid_message_flood_is_rate_limited_same_as_valid_messages(
    db_engine: AsyncEngine,
) -> None:
    """El límite general de mensajes corre ANTES de intentar parsear el JSON (ver
    `_handle_message`) -- cubre JSON inválido/desconocido con el mismo mecanismo que
    mensajes válidos, sin un contador aparte (sección 10 del audit)."""
    app = _build_ws_app(
        db_engine, WS_MESSAGE_RATE_LIMIT_MAX=3, WS_MESSAGE_RATE_LIMIT_WINDOW_SECONDS=30
    )
    with TestClient(app, client=(_fake_ip(), 50000)) as client:
        token = _register_and_login(client, email="rl-invalidflood@example.com")
        with client.websocket_connect(WS_URL) as websocket:
            websocket.send_json({"type": "auth", "token": token})
            websocket.receive_json()  # connected

            for _ in range(4):
                websocket.send_text("esto no es json")

            try:
                websocket.receive_json()
                raise AssertionError("se esperaba que la conexión se cerrara por rate limit")
            except WebSocketDisconnect as exc:
                assert exc.code == close_codes.RATE_LIMITED


# --- Test 9: reconexiones rápidas no evaden el límite por IP -----------------------------


async def test_rapid_reconnects_do_not_bypass_the_ip_connection_limit(
    db_engine: AsyncEngine,
) -> None:
    app = _build_ws_app(
        db_engine, WS_IP_CONNECT_RATE_LIMIT_MAX=3, WS_IP_CONNECT_RATE_LIMIT_WINDOW_SECONDS=30
    )
    ip = _fake_ip()
    with TestClient(app, client=(ip, 50000)) as client:
        token = _register_and_login(client, email="rl-reconnect@example.com")

        # Tres ciclos de connect -> auth -> desconectar -- cada uno consume presupuesto
        # del balde por IP (fixed-window en Redis), que NO se libera al desconectar.
        for _ in range(3):
            with client.websocket_connect(WS_URL) as websocket:
                websocket.send_json({"type": "auth", "token": token})
                assert websocket.receive_json()["type"] == "connected"

        # Una reconexión más, ya sin presupuesto -- rechazada, pese a que las tres
        # anteriores ya están cerradas (0 conexiones concurrentes en este momento).
        with client.websocket_connect(WS_URL) as websocket:
            try:
                websocket.receive_json()
                raise AssertionError("se esperaba que la reconexión se rechazara")
            except WebSocketDisconnect as exc:
                assert exc.code == close_codes.RATE_LIMITED


# --- Test 10: el contador por IP se comparte entre instancias vía Redis ------------------


async def test_ip_rate_limit_is_shared_across_backend_instances_via_redis(
    db_engine: AsyncEngine,
) -> None:
    """Dos apps FastAPI separadas (dos `TestClient` con su propio `ConnectionManager` en
    memoria cada una), pero apuntando al MISMO `REDIS_URL` (fijado por `tests/conftest.py`
    para todo el proceso) -- simula dos réplicas del backend. Si el contador viviera solo
    en memoria, cada instancia vería su propio cupo completo; acá se verifica que el cupo
    es uno solo, compartido."""
    app_a = _build_ws_app(
        db_engine, WS_IP_CONNECT_RATE_LIMIT_MAX=3, WS_IP_CONNECT_RATE_LIMIT_WINDOW_SECONDS=30
    )
    app_b = _build_ws_app(
        db_engine, WS_IP_CONNECT_RATE_LIMIT_MAX=3, WS_IP_CONNECT_RATE_LIMIT_WINDOW_SECONDS=30
    )
    ip = _fake_ip()

    with TestClient(app_a, client=(ip, 50000)) as client_a:
        token = _register_and_login(client_a, email="rl-multiinstance@example.com")

        with TestClient(app_b, client=(ip, 50000)) as client_b:
            # 2 conexiones en la instancia A...
            for _ in range(2):
                with client_a.websocket_connect(WS_URL) as websocket:
                    websocket.send_json({"type": "auth", "token": token})
                    assert websocket.receive_json()["type"] == "connected"

            # ...1 más en la instancia B llega justo al límite compartido (3)...
            with client_b.websocket_connect(WS_URL) as websocket:
                websocket.send_json({"type": "auth", "token": token})
                assert websocket.receive_json()["type"] == "connected"

            # ...y una segunda en B, ya sin cupo, se rechaza -- prueba que A y B
            # comparten el mismo contador (si cada una tuviera el suyo, esta pasaría).
            with client_b.websocket_connect(WS_URL) as websocket:
                try:
                    websocket.receive_json()
                    raise AssertionError("se esperaba que se rechazara por cupo compartido")
                except WebSocketDisconnect as exc:
                    assert exc.code == close_codes.RATE_LIMITED


# --- Test 11: Redis caído -> fail open, documentado --------------------------------------


class _BrokenRedisClient:
    """Doble mínimo que simula un Redis inalcanzable -- solo implementa lo que
    `RedisRateLimiter.check_and_increment` llama primero (`incr`), que ya alcanza para
    ejercitar el `except RedisError` de `WSRateLimiter.allow` (ver su docstring, sección
    "Redis caído")."""

    async def incr(self, key: str) -> int:
        raise RedisError("Redis no disponible (simulado)")


async def test_ws_rate_limiter_fails_open_when_redis_is_unavailable() -> None:
    limiter = WSRateLimiter(_BrokenRedisClient())

    allowed = await limiter.allow(
        "ws:ratelimit:connect_ip:doesnt-matter", limit=1, window_seconds=10, scope="test"
    )

    assert allowed is True


# --- Test 12: eventos SERVIDOR -> CLIENTE nunca se rate-limitan ---------------------------


async def test_server_to_client_events_are_never_rate_limited(db_engine: AsyncEngine) -> None:
    """Límite de mensajes por conexión deliberadamente minúsculo (1) -- si el rate
    limiter aplicara por error a lo que el servidor empuja (EventDispatcher), el
    observador se quedaría sin poder recibir más de un evento. En cambio, cada evento de
    presencia disparado por OTROS usuarios uniéndose a la sala debe seguir llegando sin
    límite -- `EventDispatcher` nunca llama a `WSRateLimiter` (ver
    `app/realtime/dispatcher.py`, sin cambios en esta fase)."""
    app = _build_ws_app(
        db_engine, WS_MESSAGE_RATE_LIMIT_MAX=1, WS_MESSAGE_RATE_LIMIT_WINDOW_SECONDS=30
    )
    with TestClient(app, client=(_fake_ip(), 50000)) as client:
        remate_id = _create_visible_remate(client, suffix="s2c")
        observer_token = _register_and_login(client, email="rl-observer@example.com")

        with client.websocket_connect(WS_URL) as observer:
            observer.send_json({"type": "auth", "token": observer_token})
            observer.receive_json()  # connected
            # Único mensaje CLIENTE -> SERVIDOR del observador -- ya consume su cupo
            # entero (límite = 1) para el resto del test.
            observer.send_json({"type": "join_room", "remate_id": remate_id})
            _receive_protocol_message(observer)  # room_joined
            _receive_protocol_message(observer)  # snapshot

            joiners = 5
            for i in range(joiners):
                joiner_token = _register_and_login(client, email=f"rl-joiner{i}@example.com")
                with client.websocket_connect(WS_URL) as joiner:
                    joiner.send_json({"type": "auth", "token": joiner_token})
                    joiner.receive_json()  # connected
                    joiner.send_json({"type": "join_room", "remate_id": remate_id})
                    joiner.receive_json()  # room_joined (o error -- no importa acá)

            # El observador recibe los `joiners` eventos de presencia sin ningún
            # problema, pese a que su propio cupo de mensajes SALIENTES está agotado --
            # confirma que recibir tráfico del servidor nunca consulta ese límite.
            for _ in range(joiners):
                event = _receive_domain_event(observer, "presencia.usuario_conectado")
                assert event["remate_id"] == remate_id
