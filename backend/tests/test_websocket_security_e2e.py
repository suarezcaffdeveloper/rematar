"""Fase 6 de remediación del WebSocket Security Audit -- Auditoría final, regresión
completa y security validation.

Este archivo NO reimplementa la cobertura ya extensa de las Fases 1-5 (ver el informe
final de Fase 6 para el mapeo completo ataque -> archivo que ya lo cubre:
`test_realtime_masking.py` para fuga de `buyer_id`/`reserve_price`/eventos privados de
moderación, `test_websocket_join_authorization.py`/`test_websocket_gateway.py` para
room spoofing vía `join_room`, `test_websocket_session_invalidation.py` para sesión
invalidada, `test_websocket_rate_limiting.py` para las cuatro protecciones DoS, y
`test_chat_xss_hardening.py` para XSS). Agrega únicamente lo que la auditoría de Fase 6
identificó como no cubierto todavía:

1. Un flujo feliz de punta a punta en un ÚNICO test (login -> auth WS -> join_room ->
   snapshot -> evento realtime -> chat -> leave_room -> disconnect) -- las suites
   anteriores prueban cada tramo por separado, ninguna los encadena a todos juntos.
2. Spoofing de identidad a nivel de PROTOCOLO WebSocket (no HTTP, ya cubierto en el
   chat): un `join_room` con campos extra (`user_id`/`role`/`is_admin`) inventados por
   el cliente -- confirma que `WSMessage`/`JoinRoomMessage` (sin `extra="forbid"`, a
   diferencia de `ChatMessageCreate` desde la Fase 5) los ignora en silencio porque
   `_handle_join_room` nunca los lee: la identidad siempre sale de `context`/`user`
   (la conexión autenticada), nunca del cuerpo del mensaje.
"""

import uuid

from fastapi.testclient import TestClient

WS_URL = "/api/v1/ws"
REGISTER_URL = "/api/v1/auth/register"
LOGIN_URL = "/api/v1/auth/login"
REMATES_URL = "/api/v1/remates"


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


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


_SIDE_CHANNEL_EVENT_PREFIXES = ("presencia.", "chat.")


def _receive_protocol_message(websocket) -> dict:
    """Descarta cualquier `domain_event` de un canal lateral (presencia/chat) --
    mismo helper que `test_websocket_gateway.py`."""
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


# --- Flujo normal de punta a punta ------------------------------------------------------


async def test_full_normal_websocket_flow_login_through_disconnect(
    ws_client: TestClient,
) -> None:
    """login -> auth WS -> join_room autorizado -> snapshot -> evento realtime (una
    oferta real) -> chat -> leave_room -> disconnect, todo en un único flujo
    encadenado -- ninguna suite anterior de las Fases 1-5 los prueba juntos."""
    owner_token = _register_and_login(ws_client, email="e2e-owner@example.com", role="rematador")
    remate = ws_client.post(
        REMATES_URL,
        json={
            "title": "Remate E2E Fase 6",
            "category": "hacienda",
            "starts_at": "2027-06-01T10:00:00Z",
        },
        headers=_auth(owner_token),
    ).json()
    lote = ws_client.post(
        f"{REMATES_URL}/{remate['id']}/lotes",
        json={
            "lot_number": "1",
            "title": "Toro Angus",
            "category": "hacienda",
            "base_price": "1000.00",
            "min_increment": "100.00",
        },
        headers=_auth(owner_token),
    ).json()
    ws_client.post(f"{REMATES_URL}/{remate['id']}/schedule", headers=_auth(owner_token))
    ws_client.post(f"{REMATES_URL}/{remate['id']}/start", headers=_auth(owner_token))
    ws_client.post(
        f"{REMATES_URL}/{remate['id']}/lotes/{lote['id']}/open", headers=_auth(owner_token)
    )

    buyer_token = _register_and_login(ws_client, email="e2e-buyer@example.com")
    manager = ws_client.app.state.connection_manager
    room_manager = ws_client.app.state.room_manager

    with ws_client.websocket_connect(WS_URL) as ws:
        # auth
        ws.send_json({"type": "auth", "token": buyer_token})
        connected = ws.receive_json()
        assert connected["type"] == "connected"
        connection_id = uuid.UUID(connected["connection_id"])
        assert manager.get(connection_id) is not None

        # join_room autorizado
        ws.send_json({"type": "join_room", "remate_id": remate["id"]})
        joined = _receive_protocol_message(ws)
        assert joined["type"] == "room_joined"

        # snapshot
        snapshot = _receive_protocol_message(ws)
        assert snapshot["type"] == "snapshot"
        assert snapshot["data"]["active_lote"]["id"] == lote["id"]

        # evento realtime real: el comprador oferta por HTTP, la confirmación le llega
        # por WS (misma conexión, mismo tipo `oferta.accepted` que ya usa el resto de la
        # app -- no un evento inventado para este test).
        bid = ws_client.post(
            f"{REMATES_URL}/{remate['id']}/lotes/{lote['id']}/ofertas",
            json={"amount": "1000.00"},
            headers=_auth(buyer_token),
        )
        assert bid.status_code == 201, bid.text
        accepted = _receive_domain_event(ws, "oferta.accepted")
        assert accepted["payload"]["amount"] == "1000.00"
        assert accepted["payload"]["buyer_id"] == connected["user_id"]  # es su propia oferta

        # chat: mensaje enviado por HTTP, confirmación por WS
        chat = ws_client.post(
            f"{REMATES_URL}/{remate['id']}/chat/messages",
            json={"content": "Vendido a buen precio!"},
            headers=_auth(buyer_token),
        )
        assert chat.status_code == 201, chat.text
        chat_event = _receive_domain_event(ws, "chat.message_sent")
        assert chat_event["payload"]["content"] == "Vendido a buen precio!"

        # leave_room
        ws.send_json({"type": "leave_room"})
        left = _receive_protocol_message(ws)
        assert left["type"] == "room_left"
        assert room_manager.room_id_for_connection(connection_id) is None

    # disconnect: cleanup completo, sin conexiones zombie.
    assert manager.get(connection_id) is None
    assert manager.count() == 0
    assert room_manager.room_count() == 0


# --- Spoofing de identidad a nivel de protocolo WebSocket -------------------------------


async def test_join_room_message_with_spoofed_identity_fields_is_ignored(
    ws_client: TestClient,
) -> None:
    """Un `join_room` con campos extra que un atacante podría esperar que alteren su
    identidad/permisos (`user_id` de otra persona, `role: admin`, `is_admin: true`) no
    tiene ningún efecto: `JoinRoomMessage` solo declara `remate_id` (Pydantic ignora el
    resto por default), y `_handle_join_room` nunca los lee -- la identidad usada para
    autorizar y para publicar el evento de presencia sale siempre de `context.user_id`
    (la conexión ya autenticada), confirmado leyendo el propio evento de presencia que
    se publica."""
    owner_token = _register_and_login(
        ws_client, email="e2e-spoof-owner@example.com", role="rematador"
    )
    remate = ws_client.post(
        REMATES_URL,
        json={
            "title": "Remate spoofing de identidad",
            "category": "hacienda",
            "starts_at": "2027-06-01T10:00:00Z",
        },
        headers=_auth(owner_token),
    ).json()
    ws_client.post(f"{REMATES_URL}/{remate['id']}/schedule", headers=_auth(owner_token))

    attacker_token = _register_and_login(ws_client, email="e2e-spoof-attacker@example.com")
    observer_token = _register_and_login(ws_client, email="e2e-spoof-observer@example.com")
    room_manager = ws_client.app.state.room_manager

    with ws_client.websocket_connect(WS_URL) as observer:
        observer.send_json({"type": "auth", "token": observer_token})
        observer.receive_json()  # connected
        observer.send_json({"type": "join_room", "remate_id": remate["id"]})
        _receive_protocol_message(observer)  # room_joined
        _receive_protocol_message(observer)  # snapshot

        with ws_client.websocket_connect(WS_URL) as attacker:
            attacker.send_json({"type": "auth", "token": attacker_token})
            connected = attacker.receive_json()
            real_user_id = connected["user_id"]
            connection_id = uuid.UUID(connected["connection_id"])

            attacker.send_json(
                {
                    "type": "join_room",
                    "remate_id": remate["id"],
                    "user_id": "11111111-1111-1111-1111-111111111111",
                    "role": "admin",
                    "is_admin": True,
                    "sender_id": "22222222-2222-2222-2222-222222222222",
                }
            )
            joined = _receive_protocol_message(attacker)
            assert joined["type"] == "room_joined"

            # RoomManager registra la conexión real, nunca el user_id inventado --
            # RoomManager ni siquiera conoce identidades de usuario (ADR-024), solo
            # connection_id, así que esto ya es imposible de spoofear por diseño.
            assert connection_id in room_manager.connections_in_room(uuid.UUID(remate["id"]))

            # El evento de presencia que le llega al observador identifica al atacante
            # con su user_id REAL (el de la sesión autenticada), no el inventado.
            event = _receive_domain_event(observer, "presencia.usuario_conectado")
            assert event["payload"]["user_id"] == real_user_id
            assert event["payload"]["user_id"] != "11111111-1111-1111-1111-111111111111"
