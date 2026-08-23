"""Tests de `ChatMessageRepository` (Épica 6, Módulo 6.4), en aislamiento -- Postgres
real, sin mocks. El foco es la paginación keyset (`list_before`), en particular la
comparación row-wise cuando dos mensajes comparten el mismo `created_at` (posible bajo
concurrencia, ver docs/34-chat-del-remate.md y ADR-037).
"""

import uuid
from datetime import UTC, datetime, timedelta

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from app.modules.chat.models import ChatMessage, ChatMessageKind
from app.modules.chat.repository import ChatMessageRepository
from tests._role_test_helpers import activate_pending_account

REGISTER_URL = "/api/v1/auth/register"
LOGIN_URL = "/api/v1/auth/login"
REMATES_URL = "/api/v1/remates"


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def _owner_token(client: AsyncClient, email: str) -> str:
    payload = {
        "email": email,
        "password": "password123",
        "confirm_password": "password123",
        "full_name": "Test",
        "phone": "+5491122334455",
        "role": "empresa",
    }
    await client.post(REGISTER_URL, json=payload)
    await activate_pending_account(email)
    login = await client.post(LOGIN_URL, data={"username": email, "password": "password123"})
    assert login.status_code == 200, login.text
    return login.json()["access_token"]


async def _create_remate(client: AsyncClient, token: str) -> str:
    payload = {
        "title": "Remate de repositorio de chat",
        "category": "hacienda",
        "starts_at": "2027-06-01T10:00:00Z",
    }
    r = await client.post(REMATES_URL, json=payload, headers=_auth(token))
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _make_message(remate_id: uuid.UUID, *, content: str, created_at: datetime) -> ChatMessage:
    return ChatMessage(
        remate_id=remate_id,
        kind=ChatMessageKind.USER,
        author_id=None,
        author_name="Test",
        author_role="comprador",
        content=content,
        created_at=created_at,
    )


async def test_list_recent_returns_the_last_n_in_chronological_order(
    client: AsyncClient, db_session: AsyncSession, db_engine: AsyncEngine
) -> None:
    owner_token = await _owner_token(client, "chatrepo1@example.com")
    remate_id = uuid.UUID(await _create_remate(client, owner_token))
    repo = ChatMessageRepository(db_session)
    base = datetime.now(UTC)

    for i in range(5):
        created_at = base + timedelta(seconds=i)
        repo.add(_make_message(remate_id, content=f"msg-{i}", created_at=created_at))
    await repo.commit()

    recent = await repo.list_recent(remate_id, limit=3)

    assert [m.content for m in recent] == ["msg-2", "msg-3", "msg-4"]


async def test_list_before_paginates_backwards_with_tied_timestamps(
    client: AsyncClient, db_session: AsyncSession, db_engine: AsyncEngine
) -> None:
    """Tres mensajes comparten EXACTAMENTE el mismo `created_at` -- la comparación
    row-wise por `(created_at, id)` debe seguir devolviendo cada uno una única vez, sin
    saltear ni duplicar, usando `id` como desempate."""
    owner_token = await _owner_token(client, "chatrepo2@example.com")
    remate_id = uuid.UUID(await _create_remate(client, owner_token))
    repo = ChatMessageRepository(db_session)
    tied_at = datetime.now(UTC)

    messages = [_make_message(remate_id, content=f"tied-{i}", created_at=tied_at) for i in range(3)]
    for m in messages:
        repo.add(m)
    await repo.commit()
    for m in messages:
        await repo.refresh(m)

    ordered_desc = sorted(messages, key=lambda m: m.id, reverse=True)

    # Página 1: los dos más "grandes" por id (desempate), entre los empatados por tiempo.
    page_1 = await repo.list_before(
        remate_id,
        before_created_at=tied_at + timedelta(seconds=1),
        before_id=uuid.uuid4(),
        limit=2,
    )
    assert [m.id for m in page_1] == [ordered_desc[1].id, ordered_desc[0].id]

    # Página 2: pide lo anterior al más viejo de la página 1 -- el tercer empatado.
    page_2 = await repo.list_before(
        remate_id,
        before_created_at=page_1[0].created_at,
        before_id=page_1[0].id,
        limit=2,
    )
    assert [m.id for m in page_2] == [ordered_desc[2].id]


async def test_list_before_excludes_the_cursor_message_itself(
    client: AsyncClient, db_session: AsyncSession, db_engine: AsyncEngine
) -> None:
    owner_token = await _owner_token(client, "chatrepo3@example.com")
    remate_id = uuid.UUID(await _create_remate(client, owner_token))
    repo = ChatMessageRepository(db_session)
    base = datetime.now(UTC)

    older = _make_message(remate_id, content="older", created_at=base)
    cursor = _make_message(remate_id, content="cursor", created_at=base + timedelta(seconds=1))
    repo.add(older)
    repo.add(cursor)
    await repo.commit()
    await repo.refresh(cursor)

    page = await repo.list_before(
        remate_id, before_created_at=cursor.created_at, before_id=cursor.id, limit=10
    )

    assert [m.content for m in page] == ["older"]


async def test_list_recent_includes_deleted_messages_unmasked_at_repository_level(
    client: AsyncClient, db_session: AsyncSession, db_engine: AsyncEngine
) -> None:
    """El enmascarado de `content` para mensajes eliminados es responsabilidad de
    `ChatMessageRead` (schema), no del repositorio -- acá se verifica que la fila
    eliminada sigue apareciendo en el historial (ver docstring de `repository.py`)."""
    owner_token = await _owner_token(client, "chatrepo4@example.com")
    remate_id = uuid.UUID(await _create_remate(client, owner_token))
    repo = ChatMessageRepository(db_session)

    message = _make_message(remate_id, content="será eliminado", created_at=datetime.now(UTC))
    message.deleted_at = datetime.now(UTC)
    repo.add(message)
    await repo.commit()

    recent = await repo.list_recent(remate_id, limit=10)

    assert len(recent) == 1
    assert recent[0].content == "será eliminado"
    assert recent[0].is_deleted is True


async def test_get_by_source_event_id_finds_only_system_messages_with_that_id(
    client: AsyncClient, db_session: AsyncSession, db_engine: AsyncEngine
) -> None:
    owner_token = await _owner_token(client, "chatrepo5@example.com")
    remate_id = uuid.UUID(await _create_remate(client, owner_token))
    repo = ChatMessageRepository(db_session)
    source_event_id = uuid.uuid4()

    system_message = ChatMessage(
        remate_id=remate_id,
        kind=ChatMessageKind.SYSTEM,
        content="El remate comenzó.",
        system_event_type="remate.started",
        source_event_id=source_event_id,
    )
    repo.add(system_message)
    await repo.commit()

    found = await repo.get_by_source_event_id(source_event_id)
    not_found = await repo.get_by_source_event_id(uuid.uuid4())

    assert found is not None
    assert found.id == system_message.id
    assert not_found is None
