"""Tests HTTP del Moderation Service (Épica 7, Módulo 7.6) -- mismo estilo que
`test_postauction_router.py`."""

import uuid

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.chat.models import ChatMessage, ChatMessageKind

REGISTER_URL = "/api/v1/auth/register"
LOGIN_URL = "/api/v1/auth/login"
REMATES_URL = "/api/v1/remates"


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def _register_and_login(client: AsyncClient, *, email: str, role: str) -> str:
    await client.post(
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
    login = await client.post(LOGIN_URL, data={"username": email, "password": "password123"})
    assert login.status_code == 200, login.text
    return login.json()["access_token"]


async def _user_id(client: AsyncClient, token: str) -> uuid.UUID:
    response = await client.get("/api/v1/users/me", headers=_auth(token))
    return uuid.UUID(response.json()["id"])


async def _setup_remate(client: AsyncClient) -> tuple[str, str, uuid.UUID, uuid.UUID]:
    rematador_token = await _register_and_login(
        client, email=f"remat{uuid.uuid4()}@example.com", role="rematador"
    )
    buyer_token = await _register_and_login(
        client, email=f"buyer{uuid.uuid4()}@example.com", role="comprador"
    )
    buyer_id = await _user_id(client, buyer_token)

    remate_response = await client.post(
        REMATES_URL,
        json={
            "title": "Remate de campo",
            "category": "hacienda",
            "starts_at": "2027-01-10T10:00:00Z",
        },
        headers=_auth(rematador_token),
    )
    assert remate_response.status_code == 201, remate_response.text
    remate_id = uuid.UUID(remate_response.json()["id"])

    # DRAFT (por defecto) solo es visible para el dueño/admin -- se programa para que
    # el resto de los tests de este archivo (buscar 403 vs. 404, lectura por un
    # comprador) ejerciten la regla real "visible pero no propio", no el ocultamiento
    # de un borrador ajeno (`RemateService._is_visible`).
    schedule_response = await client.post(
        f"{REMATES_URL}/{remate_id}/schedule", headers=_auth(rematador_token)
    )
    assert schedule_response.status_code == 200, schedule_response.text

    return rematador_token, buyer_token, remate_id, buyer_id


MODERATION_URL = "/api/v1/remates/{remate_id}/moderation"


# --- Expulsar ------------------------------------------------------------------------------


async def test_owner_can_kick_a_buyer(client: AsyncClient) -> None:
    rematador_token, _, remate_id, buyer_id = await _setup_remate(client)

    response = await client.post(
        f"{MODERATION_URL.format(remate_id=remate_id)}/expulsar",
        json={"user_id": str(buyer_id), "reason": "Lenguaje inapropiado"},
        headers=_auth(rematador_token),
    )
    assert response.status_code == 204, response.text


async def test_non_owner_cannot_kick(client: AsyncClient) -> None:
    _, _, remate_id, buyer_id = await _setup_remate(client)
    other_token = await _register_and_login(
        client, email=f"other{uuid.uuid4()}@example.com", role="rematador"
    )

    response = await client.post(
        f"{MODERATION_URL.format(remate_id=remate_id)}/expulsar",
        json={"user_id": str(buyer_id)},
        headers=_auth(other_token),
    )
    assert response.status_code == 403


async def test_comprador_cannot_kick(client: AsyncClient) -> None:
    _, buyer_token, remate_id, buyer_id = await _setup_remate(client)

    response = await client.post(
        f"{MODERATION_URL.format(remate_id=remate_id)}/expulsar",
        json={"user_id": str(buyer_id)},
        headers=_auth(buyer_token),
    )
    assert response.status_code == 403


# --- Silenciar / bloquear-chat ---------------------------------------------------------------


async def test_owner_can_mute_a_buyer(client: AsyncClient) -> None:
    rematador_token, _, remate_id, buyer_id = await _setup_remate(client)

    response = await client.post(
        f"{MODERATION_URL.format(remate_id=remate_id)}/silenciar",
        json={"user_id": str(buyer_id), "duration_seconds": 120},
        headers=_auth(rematador_token),
    )
    assert response.status_code == 204, response.text


async def test_mute_rejects_duration_above_one_hour(client: AsyncClient) -> None:
    rematador_token, _, remate_id, buyer_id = await _setup_remate(client)

    response = await client.post(
        f"{MODERATION_URL.format(remate_id=remate_id)}/silenciar",
        json={"user_id": str(buyer_id), "duration_seconds": 999999},
        headers=_auth(rematador_token),
    )
    assert response.status_code == 422


async def test_owner_can_lock_chat(client: AsyncClient) -> None:
    rematador_token, _, remate_id, _ = await _setup_remate(client)

    response = await client.post(
        f"{MODERATION_URL.format(remate_id=remate_id)}/bloquear-chat",
        json={"duration_seconds": 60},
        headers=_auth(rematador_token),
    )
    assert response.status_code == 204, response.text


async def test_muted_buyer_cannot_send_chat_messages(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    rematador_token, buyer_token, remate_id, buyer_id = await _setup_remate(client)

    mute_response = await client.post(
        f"{MODERATION_URL.format(remate_id=remate_id)}/silenciar",
        json={"user_id": str(buyer_id), "duration_seconds": 120},
        headers=_auth(rematador_token),
    )
    assert mute_response.status_code == 204

    send_response = await client.post(
        f"/api/v1/remates/{remate_id}/chat/messages",
        json={"content": "Hola"},
        headers=_auth(buyer_token),
    )
    assert send_response.status_code == 403


async def test_locked_chat_blocks_everyone(client: AsyncClient) -> None:
    rematador_token, buyer_token, remate_id, _ = await _setup_remate(client)

    lock_response = await client.post(
        f"{MODERATION_URL.format(remate_id=remate_id)}/bloquear-chat",
        json={"duration_seconds": 60},
        headers=_auth(rematador_token),
    )
    assert lock_response.status_code == 204

    send_response = await client.post(
        f"/api/v1/remates/{remate_id}/chat/messages",
        json={"content": "Hola"},
        headers=_auth(buyer_token),
    )
    assert send_response.status_code == 403


# --- Destacar mensajes -----------------------------------------------------------------------


async def test_owner_can_pin_and_unpin_a_message(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    rematador_token, buyer_token, remate_id, buyer_id = await _setup_remate(client)
    message = ChatMessage(
        remate_id=remate_id,
        kind=ChatMessageKind.USER,
        author_id=buyer_id,
        author_name="Comprador",
        author_role="comprador",
        content="Un mensaje importante",
    )
    db_session.add(message)
    await db_session.commit()
    await db_session.refresh(message)

    pin_response = await client.post(
        f"{MODERATION_URL.format(remate_id=remate_id)}/mensajes/{message.id}/destacar",
        headers=_auth(rematador_token),
    )
    assert pin_response.status_code == 204, pin_response.text

    list_response = await client.get(
        f"{MODERATION_URL.format(remate_id=remate_id)}/destacados",
        headers=_auth(buyer_token),
    )
    assert list_response.status_code == 200
    assert [item["message_id"] for item in list_response.json()] == [str(message.id)]

    unpin_response = await client.delete(
        f"{MODERATION_URL.format(remate_id=remate_id)}/mensajes/{message.id}/destacar",
        headers=_auth(rematador_token),
    )
    assert unpin_response.status_code == 204

    list_after = await client.get(
        f"{MODERATION_URL.format(remate_id=remate_id)}/destacados",
        headers=_auth(buyer_token),
    )
    assert list_after.json() == []


# --- Conectados / historial (lectura, dueño o admin) ------------------------------------------


async def test_non_owner_non_admin_cannot_read_connected_buyers(client: AsyncClient) -> None:
    _, buyer_token, remate_id, _ = await _setup_remate(client)

    response = await client.get(
        f"{MODERATION_URL.format(remate_id=remate_id)}/conectados",
        headers=_auth(buyer_token),
    )
    assert response.status_code == 403


async def test_owner_can_read_moderation_history_after_kicking(client: AsyncClient) -> None:
    rematador_token, _, remate_id, buyer_id = await _setup_remate(client)

    await client.post(
        f"{MODERATION_URL.format(remate_id=remate_id)}/expulsar",
        json={"user_id": str(buyer_id), "reason": "Prueba"},
        headers=_auth(rematador_token),
    )

    history_response = await client.get(
        f"{MODERATION_URL.format(remate_id=remate_id)}/historial",
        headers=_auth(rematador_token),
    )
    assert history_response.status_code == 200, history_response.text
    body = history_response.json()
    assert body["total"] == 1
    assert body["items"][0]["action"] == "moderacion.usuario_expulsado"
