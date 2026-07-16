"""Tests de integración de punta a punta del Event Consumer (Épica 3, Módulo 3.5): un
evento se publica con el mismo `RedisEventBus` que usa el dominio (Módulo 3.2, sin
modificar), viaja por Redis Pub/Sub real, y se verifica que llegue -- traducido a
`domain_event` -- únicamente a las conexiones WebSocket que están en la sala del remate
correspondiente. Ver docs/22-sincronizacion-tiempo-real.md y ADR-025.

Publicar requiere un cliente Redis **nuevo, creado en el loop del propio test** -- igual
razón que `ws_client`/`db_engine` en `conftest.py` (ver ADR-023, sección E): el cliente
Redis compartido de la app (`ws_client.app.state.redis`) vive atado al loop en el que
`TestClient` corre la aplicación (un hilo/loop propio, distinto del loop del test), y
reusarlo desde acá reproduciría el mismo error de "attached to a different loop".
"""

import uuid
from collections.abc import AsyncIterator
from datetime import UTC, datetime
from decimal import Decimal

import pytest_asyncio
from fastapi.testclient import TestClient
from redis.asyncio import Redis

from app.core.config import get_settings
from app.events.redis_bus import RedisEventBus
from app.modules.ofertas.events import OfertaAccepted
from app.modules.remates.events import RemateScheduled, RemateStarted
from app.modules.remates.lotes.events import LoteOpened
from app.redis.pubsub import RedisPubSub

WS_URL = "/api/v1/ws"
REGISTER_URL = "/api/v1/auth/register"
LOGIN_URL = "/api/v1/auth/login"


@pytest_asyncio.fixture
async def event_bus() -> AsyncIterator[RedisEventBus]:
    """`RedisEventBus` real, sobre un cliente Redis propio del loop del test -- ver
    docstring del módulo."""
    redis = Redis.from_url(get_settings().REDIS_URL, decode_responses=True)
    try:
        yield RedisEventBus(RedisPubSub(redis))
    finally:
        await redis.aclose()


def _register_and_login(client: TestClient, *, email: str, role: str = "comprador") -> str:
    client.post(
        REGISTER_URL,
        json={
            "email": email,
            "password": "password123",
            "full_name": "Realtime Sync",
            "role": role,
        },
    )
    login = client.post(LOGIN_URL, data={"username": email, "password": "password123"})
    assert login.status_code == 200, login.text
    return login.json()["access_token"]


def _connect_join(ws_client: TestClient, token: str, remate_id: uuid.UUID):
    websocket = ws_client.websocket_connect(WS_URL).__enter__()
    websocket.send_json({"type": "auth", "token": token})
    websocket.receive_json()  # connected
    websocket.send_json({"type": "join_room", "remate_id": str(remate_id)})
    websocket.receive_json()  # room_joined
    # Épica 3, Módulo 3.6: justo después de `room_joined` llega un `snapshot` (o, para
    # los `remate_id` aleatorios que usan estos tests, un `error/snapshot_unavailable`
    # -- ninguno de los dos es lo que estos tests de sincronización quieren observar).
    # Drenarlo acá, antes de volver al test, evita una carrera real contra los eventos
    # de dominio que el test publique después (ver docs/23-snapshot-service.md).
    websocket.receive_json()
    return websocket


async def test_domain_event_reaches_only_connections_in_the_matching_room(
    ws_client: TestClient, event_bus: RedisEventBus
) -> None:
    room_a, room_b = uuid.uuid4(), uuid.uuid4()
    token_a1 = _register_and_login(ws_client, email="sync1@example.com")
    token_a2 = _register_and_login(ws_client, email="sync2@example.com")
    token_b = _register_and_login(ws_client, email="sync3@example.com")

    ws_a1 = _connect_join(ws_client, token_a1, room_a)
    ws_a2 = _connect_join(ws_client, token_a2, room_a)
    ws_b = _connect_join(ws_client, token_b, room_b)
    try:
        await event_bus.publish(RemateStarted(remate_id=room_a))

        for ws in (ws_a1, ws_a2):
            message = ws.receive_json()
            assert message["type"] == "domain_event"
            assert message["event_type"] == "remate.started"
            assert message["remate_id"] == str(room_a)
            assert message["payload"]["remate_id"] == str(room_a)

        # ws_b está en otra sala: lo primero que le llegue después de esto tiene que
        # ser la respuesta a un mensaje propio, no el domain_event de la sala A -- si
        # el evento se hubiera filtrado a room_b, esta sería la próxima entrada en su
        # cola y el assert de abajo fallaría.
        ws_b.send_json({"type": "leave_room"})
        response = ws_b.receive_json()
        assert response == {"schema_version": 1, "type": "room_left", "remate_id": str(room_b)}
    finally:
        ws_a1.__exit__(None, None, None)
        ws_a2.__exit__(None, None, None)
        ws_b.__exit__(None, None, None)


async def test_multiple_registered_event_types_are_synced_in_order(
    ws_client: TestClient, event_bus: RedisEventBus
) -> None:
    remate_id = uuid.uuid4()
    token = _register_and_login(ws_client, email="sync4@example.com")
    websocket = _connect_join(ws_client, token, remate_id)
    try:
        lote_id = uuid.uuid4()
        await event_bus.publish(RemateStarted(remate_id=remate_id))
        await event_bus.publish(
            LoteOpened(remate_id=remate_id, lote_id=lote_id, lot_number="1", display_order=1)
        )
        await event_bus.publish(
            OfertaAccepted(
                remate_id=remate_id,
                oferta_id=uuid.uuid4(),
                lote_id=lote_id,
                buyer_id=uuid.uuid4(),
                amount=Decimal("2500.00"),
            )
        )

        first = websocket.receive_json()
        second = websocket.receive_json()
        third = websocket.receive_json()

        assert [first["event_type"], second["event_type"], third["event_type"]] == [
            "remate.started",
            "lote.opened",
            "oferta.accepted",
        ]
        assert third["payload"]["amount"] == "2500.00"
    finally:
        websocket.__exit__(None, None, None)


async def test_unregistered_event_type_is_not_forwarded(
    ws_client: TestClient, event_bus: RedisEventBus
) -> None:
    remate_id = uuid.uuid4()
    token = _register_and_login(ws_client, email="sync5@example.com")
    websocket = _connect_join(ws_client, token, remate_id)
    try:
        # RemateScheduled existe en el catálogo de dominio pero, a propósito, no está
        # en el registro de eventos sincronizables (ver app/realtime/registry.py).
        await event_bus.publish(RemateScheduled(remate_id=remate_id, starts_at=datetime.now(UTC)))

        # Nada debería haber llegado por ese evento -- lo confirmamos con la misma
        # técnica: provocar una respuesta propia y verificar que es lo primero que
        # llega, no un domain_event colado antes.
        websocket.send_json({"type": "leave_room"})
        response = websocket.receive_json()
        assert response == {
            "schema_version": 1,
            "type": "room_left",
            "remate_id": str(remate_id),
        }
    finally:
        websocket.__exit__(None, None, None)


async def test_event_for_room_without_connections_does_not_break_anything(
    ws_client: TestClient, event_bus: RedisEventBus
) -> None:
    # Nadie está conectado a esta sala -- publicar acá no debe tener ningún efecto
    # observable ni romper el consumer para otros remates.
    await event_bus.publish(RemateStarted(remate_id=uuid.uuid4()))

    # El consumer sigue vivo y funcionando: un remate con conexión real sigue
    # recibiendo sus eventos con normalidad.
    remate_id = uuid.uuid4()
    token = _register_and_login(ws_client, email="sync6@example.com")
    websocket = _connect_join(ws_client, token, remate_id)
    try:
        await event_bus.publish(RemateStarted(remate_id=remate_id))
        message = websocket.receive_json()
        assert message["event_type"] == "remate.started"
        assert message["remate_id"] == str(remate_id)
    finally:
        websocket.__exit__(None, None, None)
