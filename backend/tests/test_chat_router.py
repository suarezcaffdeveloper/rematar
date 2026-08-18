"""Tests de integración de los endpoints HTTP del chat (Épica 6, Módulo 6.4):
`POST/GET .../chat/messages`, `DELETE .../chat/messages/{id}`, `POST .../chat/typing`.
Ver docs/34-chat-del-remate.md.
"""

import uuid
from decimal import Decimal

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.modules.bots.models import BotPersonality, BotProfile
from app.modules.users.models import User, UserRole

REGISTER_URL = "/api/v1/auth/register"
LOGIN_URL = "/api/v1/auth/login"
REMATES_URL = "/api/v1/remates"
USERS_URL = "/api/v1/users"


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def _register_and_login(client: AsyncClient, *, email: str, role: str) -> str:
    await client.post(
        REGISTER_URL,
        json={
            "email": email,
            "password": "password123",
            "confirm_password": "password123",
            "full_name": "Test User",
            "phone": "+5491122334455",
            "role": role,
        },
    )
    login = await client.post(LOGIN_URL, data={"username": email, "password": "password123"})
    assert login.status_code == 200, login.text
    return login.json()["access_token"]


async def _owner(client: AsyncClient, email: str) -> str:
    return await _register_and_login(client, email=email, role="rematador")


async def _buyer(client: AsyncClient, email: str) -> str:
    return await _register_and_login(client, email=email, role="comprador")


async def _create_and_schedule_remate(client: AsyncClient, token: str) -> dict:
    payload = {
        "title": "Remate de chat HTTP",
        "category": "hacienda",
        "starts_at": "2027-06-01T10:00:00Z",
    }
    r = await client.post(REMATES_URL, json=payload, headers=_auth(token))
    assert r.status_code == 201, r.text
    remate = r.json()
    schedule = await client.post(f"{REMATES_URL}/{remate['id']}/schedule", headers=_auth(token))
    assert schedule.status_code == 200, schedule.text
    return remate


async def _send(client: AsyncClient, token: str, remate_id: str, content: str):
    return await client.post(
        f"{REMATES_URL}/{remate_id}/chat/messages", json={"content": content}, headers=_auth(token)
    )


# --- Enviar mensajes -------------------------------------------------------------------


async def test_send_message_returns_201_with_the_created_message(client: AsyncClient) -> None:
    owner_token = await _owner(client, "chatrouter1@example.com")
    remate = await _create_and_schedule_remate(client, owner_token)

    r = await _send(client, owner_token, remate["id"], "Hola a todos")

    assert r.status_code == 201, r.text
    data = r.json()
    assert data["content"] == "Hola a todos"
    assert data["kind"] == "user"
    assert data["author_role"] == "rematador"
    assert data["is_deleted"] is False


async def test_send_message_requires_authentication(client: AsyncClient) -> None:
    owner_token = await _owner(client, "chatrouter2@example.com")
    remate = await _create_and_schedule_remate(client, owner_token)

    r = await client.post(f"{REMATES_URL}/{remate['id']}/chat/messages", json={"content": "hola"})

    assert r.status_code == 401


async def test_send_empty_message_is_rejected(client: AsyncClient) -> None:
    owner_token = await _owner(client, "chatrouter3@example.com")
    remate = await _create_and_schedule_remate(client, owner_token)

    r = await _send(client, owner_token, remate["id"], "   ")

    assert r.status_code == 422


async def test_send_message_to_a_draft_remate_from_a_stranger_returns_404(
    client: AsyncClient,
) -> None:
    owner_token = await _owner(client, "chatrouter4-owner@example.com")
    payload = {"title": "Borrador", "category": "hacienda", "starts_at": "2027-06-01T10:00:00Z"}
    r = await client.post(REMATES_URL, json=payload, headers=_auth(owner_token))
    remate_id = r.json()["id"]

    stranger_token = await _buyer(client, "chatrouter4-stranger@example.com")
    response = await _send(client, stranger_token, remate_id, "hola")

    assert response.status_code == 404


async def test_send_message_rate_limited_after_the_configured_max(client: AsyncClient) -> None:
    owner_token = await _owner(client, "chatrouter5@example.com")
    remate = await _create_and_schedule_remate(client, owner_token)

    # Default: CHAT_RATE_LIMIT_MAX_MESSAGES=5 por CHAT_RATE_LIMIT_WINDOW_SECONDS=10.
    responses = [await _send(client, owner_token, remate["id"], f"mensaje {i}") for i in range(6)]

    assert [r.status_code for r in responses[:5]] == [201] * 5
    assert responses[5].status_code == 429


# --- Historial ---------------------------------------------------------------------------


async def test_list_messages_returns_recent_history_in_chronological_order(
    client: AsyncClient,
) -> None:
    owner_token = await _owner(client, "chatrouter6@example.com")
    remate = await _create_and_schedule_remate(client, owner_token)
    await _send(client, owner_token, remate["id"], "primero")
    await _send(client, owner_token, remate["id"], "segundo")

    r = await client.get(f"{REMATES_URL}/{remate['id']}/chat/messages", headers=_auth(owner_token))

    assert r.status_code == 200, r.text
    contents = [m["content"] for m in r.json()]
    assert contents == ["primero", "segundo"]


async def test_list_messages_before_cursor_paginates_backwards(client: AsyncClient) -> None:
    owner_token = await _owner(client, "chatrouter7@example.com")
    remate = await _create_and_schedule_remate(client, owner_token)
    for i in range(3):
        await _send(client, owner_token, remate["id"], f"msg-{i}")

    first_page = await client.get(
        f"{REMATES_URL}/{remate['id']}/chat/messages", headers=_auth(owner_token)
    )
    oldest_of_first_page = first_page.json()[0]

    r = await client.get(
        f"{REMATES_URL}/{remate['id']}/chat/messages",
        params={
            "before_created_at": oldest_of_first_page["created_at"],
            "before_id": oldest_of_first_page["id"],
        },
        headers=_auth(owner_token),
    )

    assert r.status_code == 200, r.text
    assert r.json() == []  # "msg-0" ya era el más viejo, no hay nada antes


# --- Moderación ----------------------------------------------------------------------------


async def test_owner_can_delete_a_message(client: AsyncClient) -> None:
    owner_token = await _owner(client, "chatrouter8@example.com")
    remate = await _create_and_schedule_remate(client, owner_token)
    sent = await _send(client, owner_token, remate["id"], "borrame")
    message_id = sent.json()["id"]

    r = await client.delete(
        f"{REMATES_URL}/{remate['id']}/chat/messages/{message_id}", headers=_auth(owner_token)
    )

    assert r.status_code == 200, r.text
    data = r.json()
    assert data["is_deleted"] is True
    assert data["content"] is None  # nunca se expone el texto de un mensaje eliminado


async def test_non_owner_cannot_delete_a_message(client: AsyncClient) -> None:
    owner_token = await _owner(client, "chatrouter9-owner@example.com")
    remate = await _create_and_schedule_remate(client, owner_token)
    sent = await _send(client, owner_token, remate["id"], "hola")
    message_id = sent.json()["id"]

    buyer_token = await _buyer(client, "chatrouter9-buyer@example.com")
    r = await client.delete(
        f"{REMATES_URL}/{remate['id']}/chat/messages/{message_id}", headers=_auth(buyer_token)
    )

    assert r.status_code == 403


async def test_deleting_a_nonexistent_message_returns_404(client: AsyncClient) -> None:
    owner_token = await _owner(client, "chatrouter10@example.com")
    remate = await _create_and_schedule_remate(client, owner_token)

    r = await client.delete(
        f"{REMATES_URL}/{remate['id']}/chat/messages/00000000-0000-0000-0000-000000000000",
        headers=_auth(owner_token),
    )

    assert r.status_code == 404


# --- Está escribiendo... ----------------------------------------------------------------


async def test_typing_endpoint_returns_204(client: AsyncClient) -> None:
    owner_token = await _owner(client, "chatrouter11@example.com")
    remate = await _create_and_schedule_remate(client, owner_token)

    r = await client.post(
        f"{REMATES_URL}/{remate['id']}/chat/typing", headers=_auth(owner_token)
    )

    assert r.status_code == 204


# --- Foto de perfil del autor -------------------------------------------------------------


async def test_send_message_response_includes_the_senders_current_avatar(
    client: AsyncClient,
) -> None:
    owner_token = await _owner(client, "chatrouter-avatar1@example.com")
    patch = await client.patch(
        f"{USERS_URL}/me", json={"avatar_url": "preset:bob"}, headers=_auth(owner_token)
    )
    assert patch.status_code == 200, patch.text
    remate = await _create_and_schedule_remate(client, owner_token)

    r = await _send(client, owner_token, remate["id"], "hola")

    assert r.status_code == 201, r.text
    assert r.json()["author_avatar_url"] == "preset:bob"


async def test_list_messages_reflects_the_authors_current_avatar_even_for_old_messages(
    client: AsyncClient,
) -> None:
    """Pedido explícito: si el autor cambia su foto de perfil, los mensajes que ya
    había mandado tienen que mostrar la nueva -- a diferencia de `author_name`/
    `author_role`, que sí quedan congelados al momento de enviar (ver ADR-037)."""
    owner_token = await _owner(client, "chatrouter-avatar2@example.com")
    remate = await _create_and_schedule_remate(client, owner_token)
    await _send(client, owner_token, remate["id"], "antes de cambiar la foto")

    patch = await client.patch(
        f"{USERS_URL}/me", json={"avatar_url": "preset:senior"}, headers=_auth(owner_token)
    )
    assert patch.status_code == 200, patch.text

    r = await client.get(f"{REMATES_URL}/{remate['id']}/chat/messages", headers=_auth(owner_token))

    assert r.status_code == 200, r.text
    messages = r.json()
    assert len(messages) == 1
    assert messages[0]["author_avatar_url"] == "preset:senior"


async def test_list_messages_without_an_avatar_returns_null(client: AsyncClient) -> None:
    owner_token = await _owner(client, "chatrouter-avatar3@example.com")
    remate = await _create_and_schedule_remate(client, owner_token)
    await _send(client, owner_token, remate["id"], "sin foto de perfil")

    r = await client.get(f"{REMATES_URL}/{remate['id']}/chat/messages", headers=_auth(owner_token))

    assert r.status_code == 200, r.text
    assert r.json()[0]["author_avatar_url"] is None


async def test_delete_message_response_includes_the_authors_avatar(client: AsyncClient) -> None:
    owner_token = await _owner(client, "chatrouter-avatar4@example.com")
    await client.patch(
        f"{USERS_URL}/me", json={"avatar_url": "preset:curly"}, headers=_auth(owner_token)
    )
    remate = await _create_and_schedule_remate(client, owner_token)
    sent = await _send(client, owner_token, remate["id"], "borrame")
    message_id = sent.json()["id"]

    r = await client.delete(
        f"{REMATES_URL}/{remate['id']}/chat/messages/{message_id}", headers=_auth(owner_token)
    )

    assert r.status_code == 200, r.text
    assert r.json()["author_avatar_url"] == "preset:curly"


# --- Identidad de simuladores (módulo de Bots) -------------------------------------------


async def test_list_messages_marks_bot_authored_message_as_is_bot(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """`author_id` nunca se enmascara en el chat -- a diferencia de
    `OfertaSnapshotEntry.buyer_id`, así que `is_bot` es la única señal disponible para
    que cualquier participante (no solo el rematador) no confunda un mensaje generado
    por un simulador con uno de un comprador real (ver docstring de
    `ChatMessageRead.is_bot`)."""
    owner_register = await client.post(
        REGISTER_URL,
        json={
            "email": "chatrouter-bot1@example.com",
            "password": "password123",
            "confirm_password": "password123",
            "full_name": "Rematador",
            "phone": "+5491122334455",
            "role": "rematador",
        },
    )
    owner_id = owner_register.json()["id"]
    owner_token = await _owner(client, "chatrouter-bot1-owner@example.com")
    remate = await _create_and_schedule_remate(client, owner_token)

    bot_user = User(
        email="bot+chatrouter1@bots.rematar.internal",
        hashed_password=hash_password("unused"),
        full_name="Bot de prueba",
        role=UserRole.COMPRADOR,
    )
    db_session.add(bot_user)
    await db_session.commit()
    await db_session.refresh(bot_user)
    db_session.add(
        BotProfile(
            created_by_id=uuid.UUID(owner_id),
            user_id=bot_user.id,
            display_name="Bot de prueba",
            personality=BotPersonality.COMPETITIVE,
            max_budget=Decimal("5000.00"),
            reaction_delay_min_seconds=1,
            reaction_delay_max_seconds=2,
            continue_probability=Decimal("0.5"),
        )
    )
    await db_session.commit()

    login = await client.post(
        LOGIN_URL, data={"username": bot_user.email, "password": "unused"}
    )
    assert login.status_code == 200, login.text
    bot_token = login.json()["access_token"]

    await _send(client, bot_token, remate["id"], "Voy por este lote.")
    await _send(client, owner_token, remate["id"], "Bienvenidos al remate.")

    r = await client.get(f"{REMATES_URL}/{remate['id']}/chat/messages", headers=_auth(owner_token))
    assert r.status_code == 200, r.text
    messages = r.json()

    by_content = {m["content"]: m for m in messages}
    assert by_content["Voy por este lote."]["is_bot"] is True
    assert by_content["Bienvenidos al remate."]["is_bot"] is False
