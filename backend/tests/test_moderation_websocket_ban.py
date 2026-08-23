"""Test de integración del chequeo de ban en `_handle_join_room`
(`app/websocket/router.py`, Épica 7, Módulo 7.6) -- mismo estilo y fixtures que
`test_websocket_gateway.py`: un comprador expulsado (fila en `remate_bans`) no puede
volver a unirse a la sala del remate.
"""

import uuid

from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.moderation.models import RemateBan
from app.moderation.schemas import ERROR_BANNED_FROM_ROOM
from tests._role_test_helpers import activate_pending_account_sync

WS_URL = "/api/v1/ws"
REGISTER_URL = "/api/v1/auth/register"
LOGIN_URL = "/api/v1/auth/login"
REMATES_URL = "/api/v1/remates"


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


def _user_id(client: TestClient, token: str) -> uuid.UUID:
    response = client.get("/api/v1/users/me", headers={"Authorization": f"Bearer {token}"})
    return uuid.UUID(response.json()["id"])


async def test_banned_buyer_cannot_join_the_room(
    ws_client: TestClient, db_session: AsyncSession
) -> None:
    rematador_token = _register_and_login(
        ws_client, email=f"remat{uuid.uuid4()}@example.com", role="empresa"
    )
    buyer_token = _register_and_login(
        ws_client, email=f"buyer{uuid.uuid4()}@example.com", role="comprador"
    )
    buyer_id = _user_id(ws_client, buyer_token)

    remate_response = ws_client.post(
        REMATES_URL,
        json={"title": "Remate de campo", "category": "hacienda"},
        headers={"Authorization": f"Bearer {rematador_token}"},
    )
    remate_id = uuid.UUID(remate_response.json()["id"])

    db_session.add(RemateBan(remate_id=remate_id, user_id=buyer_id, banned_by_id=None))
    await db_session.commit()

    with ws_client.websocket_connect(WS_URL) as websocket:
        websocket.send_json({"type": "auth", "token": buyer_token})
        websocket.receive_json()  # connected

        websocket.send_json({"type": "join_room", "remate_id": str(remate_id)})
        response = websocket.receive_json()

        assert response["type"] == "error"
        assert response["code"] == ERROR_BANNED_FROM_ROOM

        room_manager = ws_client.app.state.room_manager
        assert room_manager.room_count() == 0


async def test_non_banned_buyer_can_join_the_same_remate(
    ws_client: TestClient, db_session: AsyncSession
) -> None:
    rematador_token = _register_and_login(
        ws_client, email=f"remat{uuid.uuid4()}@example.com", role="empresa"
    )
    other_buyer_token = _register_and_login(
        ws_client, email=f"buyer{uuid.uuid4()}@example.com", role="comprador"
    )

    remate_response = ws_client.post(
        REMATES_URL,
        json={
            "title": "Remate de campo",
            "category": "hacienda",
            "starts_at": "2027-06-01T10:00:00Z",
        },
        headers={"Authorization": f"Bearer {rematador_token}"},
    )
    remate_id = uuid.UUID(remate_response.json()["id"])
    # Fase 2 de remediación del WebSocket Security Audit: `join_room` ahora exige
    # autorización de dominio antes de la membresía -- un remate recién creado queda en
    # DRAFT (solo visible para su dueño), así que hace falta programarlo para que este
    # comprador (no dueño, no admin) también pueda verlo. Lo que este test verifica
    # específicamente es que el chequeo de baneo no rechace a alguien que no está
    # baneado -- no la autorización de visibilidad en sí, ya cubierta en
    # `test_websocket_gateway.py`.
    schedule = ws_client.post(
        f"{REMATES_URL}/{remate_id}/schedule",
        headers={"Authorization": f"Bearer {rematador_token}"},
    )
    assert schedule.status_code == 200, schedule.text

    with ws_client.websocket_connect(WS_URL) as websocket:
        websocket.send_json({"type": "auth", "token": other_buyer_token})
        websocket.receive_json()  # connected

        websocket.send_json({"type": "join_room", "remate_id": str(remate_id)})
        response = websocket.receive_json()

        assert response["type"] == "room_joined"
