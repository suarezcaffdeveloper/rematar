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
from tests._role_test_helpers import activate_pending_account_sync

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
    register = client.post(
        REGISTER_URL,
        json={
            "email": email,
            "password": "password123",
            "confirm_password": "password123",
            "full_name": "Realtime Sync",
            "phone": "+5491122334455",
            "role": role,
        },
    )
    assert register.status_code == 201, register.text
    if role in ("empresa", "rematador"):
        activate_pending_account_sync(email)
    login = client.post(LOGIN_URL, data={"username": email, "password": "password123"})
    assert login.status_code == 200, login.text
    return login.json()["access_token"]


def _create_visible_remate(client: TestClient, *, suffix: str) -> uuid.UUID:
    """Crea y programa (DRAFT -> SCHEDULED) un remate para que sea visible para
    cualquier usuario autenticado -- ver `RemateService._is_visible`.

    Fase 2 de remediación del WebSocket Security Audit: `join_room` ahora exige
    autorización de dominio ANTES de crear la membresía en la sala
    (`app/websocket/router.py::_handle_join_room`). Este archivo es de la Fase 1 (Módulo
    3.5) y usaba `remate_id = uuid.uuid4()` a propósito -- a estos tests de
    sincronización Redis Pub/Sub -> WS no les importa el dominio, solo el mecanismo de
    entrega (ADR-025) -- pero un UUID que no corresponde a ningún remate real ya no
    alcanza para unirse a una sala: hace falta un remate real y visible."""
    owner_token = _register_and_login(
        client, email=f"sync-owner-{suffix}@example.com", role="empresa"
    )
    remate = client.post(
        "/api/v1/remates",
        json={
            "title": "Remate de sincronización realtime",
            "category": "hacienda",
            "starts_at": "2027-06-01T10:00:00Z",
        },
        headers={"Authorization": f"Bearer {owner_token}"},
    )
    assert remate.status_code == 201, remate.text
    remate_id = remate.json()["id"]
    schedule = client.post(
        f"/api/v1/remates/{remate_id}/schedule",
        headers={"Authorization": f"Bearer {owner_token}"},
    )
    assert schedule.status_code == 200, schedule.text
    return uuid.UUID(remate_id)


# Ver el mismo mecanismo, comentado en detalle, en test_websocket_gateway.py.
_SIDE_CHANNEL_EVENT_PREFIXES = ("presencia.", "chat.")


def _receive_non_presence_message(websocket) -> dict:
    """`receive_json()` que descarta cualquier `domain_event` de un canal lateral
    (presencia, chat) que llegue intercalado -- un `join_room`/`leave_room` real
    publica su propio evento de presencia de forma asíncrona (Redis Pub/Sub -> Event
    Consumer, sin cambios), y publicar `RemateStarted`/`LoteOpened`/etc. (lo que varios
    tests de este archivo hacen directamente) dispara además un mensaje de sistema de
    chat -- ninguno de los dos tiene garantía de en qué punto exacto, relativo a los
    mensajes de protocolo o a los eventos de dominio que estos tests sí quieren
    observar, termina de entregarse -- incluida la propia conexión que se acaba de unir
    (recibe su propio `presencia.usuario_conectado`, igual que ya recibía su propio
    `oferta.accepted` al ofertar). Mismo helper que `_receive_protocol_message` en
    `test_websocket_gateway.py`."""
    while True:
        message = websocket.receive_json()
        is_side_channel_event = message.get("type") == "domain_event" and str(
            message.get("event_type", "")
        ).startswith(_SIDE_CHANNEL_EVENT_PREFIXES)
        if not is_side_channel_event:
            return message


def _connect_join(ws_client: TestClient, token: str, remate_id: uuid.UUID):
    websocket = ws_client.websocket_connect(WS_URL).__enter__()
    websocket.send_json({"type": "auth", "token": token})
    websocket.receive_json()  # connected
    websocket.send_json({"type": "join_room", "remate_id": str(remate_id)})
    _receive_non_presence_message(websocket)  # room_joined
    # Épica 3, Módulo 3.6: justo después de `room_joined` llega un `snapshot` -- no es
    # lo que estos tests de sincronización quieren observar. Drenarlo acá, antes de
    # volver al test, evita una carrera real contra los eventos de dominio que el test
    # publique después (ver docs/23-snapshot-service.md).
    _receive_non_presence_message(websocket)
    return websocket


async def test_domain_event_reaches_only_connections_in_the_matching_room(
    ws_client: TestClient, event_bus: RedisEventBus
) -> None:
    room_a = _create_visible_remate(ws_client, suffix="1a")
    room_b = _create_visible_remate(ws_client, suffix="1b")
    token_a1 = _register_and_login(ws_client, email="sync1@example.com")
    token_a2 = _register_and_login(ws_client, email="sync2@example.com")
    token_b = _register_and_login(ws_client, email="sync3@example.com")

    ws_a1 = _connect_join(ws_client, token_a1, room_a)
    ws_a2 = _connect_join(ws_client, token_a2, room_a)
    ws_b = _connect_join(ws_client, token_b, room_b)
    try:
        await event_bus.publish(RemateStarted(remate_id=room_a))

        for ws in (ws_a1, ws_a2):
            message = _receive_non_presence_message(ws)
            assert message["type"] == "domain_event"
            assert message["event_type"] == "remate.started"
            assert message["remate_id"] == str(room_a)
            assert message["payload"]["remate_id"] == str(room_a)

        # ws_b está en otra sala: lo primero que le llegue después de esto tiene que
        # ser la respuesta a un mensaje propio, no el domain_event de la sala A -- si
        # el evento se hubiera filtrado a room_b, esta sería la próxima entrada en su
        # cola y el assert de abajo fallaría.
        ws_b.send_json({"type": "leave_room"})
        response = _receive_non_presence_message(ws_b)
        assert response == {"schema_version": 1, "type": "room_left", "remate_id": str(room_b)}
    finally:
        ws_a1.__exit__(None, None, None)
        ws_a2.__exit__(None, None, None)
        ws_b.__exit__(None, None, None)


async def test_multiple_registered_event_types_are_synced_in_order(
    ws_client: TestClient, event_bus: RedisEventBus
) -> None:
    remate_id = _create_visible_remate(ws_client, suffix="4")
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

        first = _receive_non_presence_message(websocket)
        second = _receive_non_presence_message(websocket)
        third = _receive_non_presence_message(websocket)

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
    remate_id = _create_visible_remate(ws_client, suffix="5")
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
        response = _receive_non_presence_message(websocket)
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
    remate_id = _create_visible_remate(ws_client, suffix="6")
    token = _register_and_login(ws_client, email="sync6@example.com")
    websocket = _connect_join(ws_client, token, remate_id)
    try:
        await event_bus.publish(RemateStarted(remate_id=remate_id))
        message = _receive_non_presence_message(websocket)
        assert message["event_type"] == "remate.started"
        assert message["remate_id"] == str(remate_id)
    finally:
        websocket.__exit__(None, None, None)
