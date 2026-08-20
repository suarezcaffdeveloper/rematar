"""Tests de Chat/XSS y hardening del protocolo de mensajes (Fase 5 de remediación del
WebSocket Security Audit). Ver `app/modules/chat/text.py`, `app/modules/chat/schemas.py`
y `app/modules/chat/realtime.py`.

## Por qué estos tests no "ejecutan" nada en un navegador

El chat es texto plano (sin Markdown/HTML/autolinking, ver el análisis de Fase 5) y el
frontend renderiza `content` con interpolación de texto de React (`{message.content}`),
que escapa cualquier child por default -- no existe un solo `dangerouslySetInnerHTML`/
`innerHTML` en todo `frontend/src` (verificado explícitamente, ver
`frontend/src/features/chat/components/ChatMessageItem.test.tsx` para la prueba directa
de que un payload de estos tests nunca se convierte en un nodo `<script>`/`<img
onerror>` real del DOM). Estos tests de acá verifican la mitad backend de esa cadena:
que un payload "malicioso" viaja intacto (nunca se transforma en HTML, nunca rompe el
protocolo) desde `POST` hasta la respuesta JSON y el historial persistido -- exactamente
lo que hace falta para que la garantía del lado del frontend siga siendo válida.
"""

import json
import uuid as uuid_module

from httpx import AsyncClient
from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import get_settings
from app.core.security import hash_password
from app.events.base import DomainEvent
from app.modules.chat.models import ChatMessage
from app.modules.chat.realtime import ChatSystemEventDispatcher
from app.modules.chat.schemas import ChatMessageCreate
from app.modules.chat.text import sanitize_chat_text
from app.modules.users.models import User, UserRole
from app.redis.rate_limit import RedisRateLimiter

REGISTER_URL = "/api/v1/auth/register"
LOGIN_URL = "/api/v1/auth/login"
REMATES_URL = "/api/v1/remates"
USERS_URL = "/api/v1/users"


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def _register_and_login(client: AsyncClient, *, email: str, role: str = "comprador") -> str:
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


async def _create_and_schedule_remate(client: AsyncClient, token: str) -> dict:
    payload = {
        "title": "Remate de hardening de chat",
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


# --- TEST 1-3, 5: payloads XSS viajan intactos, nunca se interpretan/mutan -------------

XSS_PAYLOADS = {
    "script_basico": "<script>alert(1)</script>",
    "event_handler_img": '<img src=x onerror=alert(1)>',
    "svg_handler": '<svg onload=alert(1)><circle r=1></svg>',
    "encoded_variant": "&lt;script&gt;alert(1)&lt;/script&gt;<script>alert(1)</script>",
}


async def test_xss_payloads_are_stored_and_returned_verbatim_never_mutated(
    client: AsyncClient,
) -> None:
    """TEST 1/2/3/5 del enunciado (script básico, event handler `onerror`, SVG con
    handler, variante encoded) -- el backend nunca "limpia" HTML porque nunca lo trata
    como HTML: si el payload volviera distinto de como se mandó, sería la señal de que
    algo en el medio lo está interpretando/transformando, justo lo que NO debe pasar."""
    owner_token = await _owner(client, "xss1-owner@example.com")
    remate = await _create_and_schedule_remate(client, owner_token)

    for label, payload in XSS_PAYLOADS.items():
        r = await _send(client, owner_token, remate["id"], payload)
        assert r.status_code == 201, f"{label}: {r.text}"
        assert r.json()["content"] == payload, label
        assert r.headers["content-type"].startswith("application/json"), label


async def test_xss_payload_response_is_json_never_html_content_type(client: AsyncClient) -> None:
    """Aunque el string contenga `<script>`, la respuesta HTTP nunca es
    `text/html` -- ni siquiera pegando la URL directo en un navegador se interpretaría
    como una página."""
    owner_token = await _owner(client, "xss2-owner@example.com")
    remate = await _create_and_schedule_remate(client, owner_token)

    r = await _send(client, owner_token, remate["id"], "<script>alert(document.cookie)</script>")

    assert r.status_code == 201, r.text
    assert r.headers["content-type"] == "application/json"


# --- TEST 4: URLs javascript: nunca se convierten en un link ---------------------------


async def test_javascript_url_is_stored_as_inert_text_chat_has_no_autolinking(
    client: AsyncClient,
) -> None:
    """El chat no soporta links (sin Markdown/autolink en ningún punto del pipeline, ver
    docstring del módulo) -- un `javascript:` embebido en el texto es, y sigue siendo,
    texto plano inerte, nunca un `<a href="javascript:...">`."""
    owner_token = await _owner(client, "xss3-owner@example.com")
    remate = await _create_and_schedule_remate(client, owner_token)
    payload = 'Mirá esto: <a href="javascript:alert(1)">click acá</a> o directo javascript:alert(1)'

    r = await _send(client, owner_token, remate["id"], payload)

    assert r.status_code == 201, r.text
    assert r.json()["content"] == payload


# --- TEST 6: Stored XSS -- persistencia, otro usuario lo lee después -------------------


async def test_stored_xss_payload_remains_inert_when_another_user_loads_history(
    client: AsyncClient,
) -> None:
    """usuario A envía payload malicioso -> se persiste -> usuario B (sesión
    independiente) entra después y carga el historial -> el payload le llega intacto,
    como texto -- nunca ejecutado ni transformado en el camino."""
    owner_token = await _owner(client, "xss4-owner@example.com")
    remate = await _create_and_schedule_remate(client, owner_token)
    payload = "<img src=x onerror=alert(document.cookie)>"

    sent = await _send(client, owner_token, remate["id"], payload)
    assert sent.status_code == 201, sent.text

    other_user_token = await _register_and_login(client, email="xss4-victim@example.com")
    history = await client.get(
        f"{REMATES_URL}/{remate['id']}/chat/messages", headers=_auth(other_user_token)
    )

    assert history.status_code == 200, history.text
    messages = history.json()
    assert len(messages) == 1
    assert messages[0]["content"] == payload
    assert messages[0]["author_id"] is not None  # sigue atribuido al autor real


# --- TEST 7: autoría -- el cliente no puede falsificar el autor ------------------------


async def test_extra_user_id_field_in_request_body_is_rejected(client: AsyncClient) -> None:
    """`ChatMessageCreate(extra="forbid")` -- un intento de mandar `user_id` en el body
    se rechaza de plano (422), nunca se procesa parcialmente ignorando el campo."""
    owner_token = await _owner(client, "xss5-owner@example.com")
    remate = await _create_and_schedule_remate(client, owner_token)

    r = await client.post(
        f"{REMATES_URL}/{remate['id']}/chat/messages",
        json={"content": "hola", "user_id": "11111111-1111-1111-1111-111111111111"},
        headers=_auth(owner_token),
    )

    assert r.status_code == 422, r.text


async def test_authored_message_always_reflects_the_authenticated_caller(
    client: AsyncClient,
) -> None:
    """Confirmación positiva (no solo "el campo se rechaza si se manda de más"): un envío
    normal siempre atribuye el mensaje al usuario autenticado real, nunca a nadie más --
    `author_id`/`author_name`/`author_role` se resuelven server-side desde la sesión, no
    del body (`ChatMessageCreate` solo tiene `content`)."""
    owner_token = await _owner(client, "xss6-owner@example.com")
    remate = await _create_and_schedule_remate(client, owner_token)

    me = await client.get(f"{USERS_URL}/me", headers=_auth(owner_token))
    assert me.status_code == 200, me.text

    r = await _send(client, owner_token, remate["id"], "quien manda esto soy yo")

    assert r.status_code == 201, r.text
    data = r.json()
    assert data["author_id"] == me.json()["id"]
    assert data["author_name"] == me.json()["full_name"]
    assert data["author_role"] == "rematador"


# --- TEST 8: room/remate spoofing -------------------------------------------------------


async def test_cannot_send_chat_message_to_a_remate_outside_own_visibility(
    client: AsyncClient,
) -> None:
    """El cliente no puede mandar un mensaje a un remate ajeno cambiando `remate_id` en
    la URL -- la autorización reutiliza la misma visibilidad de dominio que ya usa
    `SnapshotService.assert_visible` para `join_room` (Fase 2): un DRAFT ajeno da 404,
    nunca se crea el mensaje. (Complementa
    `test_chat_router.py::test_send_message_to_a_draft_remate_from_a_stranger_returns_404`,
    ya existente, con el mismo caso pero nombrado explícitamente para la Fase 5)."""
    owner_token = await _owner(client, "xss7-owner@example.com")
    draft = await client.post(
        REMATES_URL,
        json={
            "title": "Remate ajeno, sin programar",
            "category": "hacienda",
            "starts_at": "2027-06-01T10:00:00Z",
        },
        headers=_auth(owner_token),
    )
    assert draft.status_code == 201, draft.text
    remate_id = draft.json()["id"]

    stranger_token = await _register_and_login(client, email="xss7-stranger@example.com")
    r = await _send(client, stranger_token, remate_id, "intento colarme en esta sala")

    assert r.status_code == 404, r.text

    # Ningún mensaje quedó persistido -- ni siquiera visible para el propio dueño.
    history = await client.get(
        f"{REMATES_URL}/{remate_id}/chat/messages", headers=_auth(owner_token)
    )
    assert history.json() == []


# --- TEST 9: mensaje demasiado largo -----------------------------------------------------


async def test_message_over_the_configured_max_length_is_rejected(client: AsyncClient) -> None:
    owner_token = await _owner(client, "xss8-owner@example.com")
    remate = await _create_and_schedule_remate(client, owner_token)

    r = await _send(client, owner_token, remate["id"], "x" * 501)  # CHAT_MESSAGE_MAX_LENGTH=500

    assert r.status_code == 422, r.text
    assert r.json()["error"]["code"] == "business_rule_violation"


# --- TEST 10: JSON inválido ---------------------------------------------------------------


async def test_invalid_json_body_is_rejected_with_controlled_response(client: AsyncClient) -> None:
    owner_token = await _owner(client, "xss9-owner@example.com")
    remate = await _create_and_schedule_remate(client, owner_token)

    r = await client.post(
        f"{REMATES_URL}/{remate['id']}/chat/messages",
        content=b"esto no es json {{{",
        headers={**_auth(owner_token), "Content-Type": "application/json"},
    )

    assert r.status_code == 422, r.text
    assert r.json()["error"]["code"] == "validation_error"


# --- TEST 11: tipos incorrectos -----------------------------------------------------------


async def test_content_as_object_instead_of_string_is_rejected(client: AsyncClient) -> None:
    owner_token = await _owner(client, "xss10-owner@example.com")
    remate = await _create_and_schedule_remate(client, owner_token)

    r = await client.post(
        f"{REMATES_URL}/{remate['id']}/chat/messages",
        json={"content": {"nested": "object"}},
        headers=_auth(owner_token),
    )

    assert r.status_code == 422, r.text


async def test_content_as_array_instead_of_string_is_rejected(client: AsyncClient) -> None:
    owner_token = await _owner(client, "xss10b-owner@example.com")
    remate = await _create_and_schedule_remate(client, owner_token)

    r = await client.post(
        f"{REMATES_URL}/{remate['id']}/chat/messages",
        json={"content": ["a", "b"]},
        headers=_auth(owner_token),
    )

    assert r.status_code == 422, r.text


# --- TEST 12: campos desconocidos no alteran la semántica del mensaje -------------------


async def test_unknown_privilege_looking_fields_are_rejected_outright(client: AsyncClient) -> None:
    owner_token = await _owner(client, "xss11-owner@example.com")
    remate = await _create_and_schedule_remate(client, owner_token)

    r = await client.post(
        f"{REMATES_URL}/{remate['id']}/chat/messages",
        json={
            "content": "hola",
            "role": "admin",
            "sender_id": "11111111-1111-1111-1111-111111111111",
            "is_admin": True,
            "created_at": "1999-01-01T00:00:00Z",
        },
        headers=_auth(owner_token),
    )

    assert r.status_code == 422, r.text


# --- TEST 13: usuario invalidado (cuenta suspendida) ------------------------------------


async def _create_admin_directly(db_session: AsyncSession, email: str) -> None:
    db_session.add(
        User(
            email=email,
            hashed_password=hash_password("adminpass123"),
            full_name="Admin Test",
            role=UserRole.ADMIN,
        )
    )
    await db_session.commit()


async def test_suspended_user_cannot_send_chat_messages(
    client: AsyncClient, db_session: AsyncSession
) -> None:
    """`get_current_user_from_access_token` (usado por CADA endpoint HTTP, incluido
    chat) chequea `user.is_active` en cada request -- una suspensión bloquea el envío de
    inmediato, con el mismo access token todavía sin vencer. (Nota de alcance: un simple
    `logout`/revocación de UNA sesión puntual, a diferencia de una suspensión de cuenta,
    NO se chequea en el camino HTTP por diseño explícito de la Fase 3 -- ver docstring de
    `AuthService.get_current_session_from_access_token` -- para no agregarle una consulta
    extra a `refresh_tokens` a cada request HTTP de la app; ver el informe final de esta
    fase para el detalle.)"""
    await _create_admin_directly(db_session, "xss12-admin@example.com")
    admin_login = await client.post(
        LOGIN_URL, data={"username": "xss12-admin@example.com", "password": "adminpass123"}
    )
    admin_token = admin_login.json()["access_token"]

    owner_token = await _owner(client, "xss12-owner@example.com")
    remate = await _create_and_schedule_remate(client, owner_token)

    me = await client.get(f"{USERS_URL}/me", headers=_auth(owner_token))
    owner_id = me.json()["id"]

    suspend = await client.patch(
        f"{USERS_URL}/{owner_id}/status", headers=_auth(admin_token), json={"is_active": False}
    )
    assert suspend.status_code == 200, suspend.text

    r = await _send(client, owner_token, remate["id"], "sigo pudiendo escribir?")

    assert r.status_code == 401, r.text


# --- TEST 14: mensaje normal sigue funcionando ------------------------------------------


async def test_normal_legitimate_message_still_works(client: AsyncClient) -> None:
    owner_token = await _owner(client, "xss13-owner@example.com")
    remate = await _create_and_schedule_remate(client, owner_token)

    r = await _send(client, owner_token, remate["id"], "Hola, bienvenidos al remate!")

    assert r.status_code == 201, r.text
    assert r.json()["content"] == "Hola, bienvenidos al remate!"


# --- TEST 15: bots siguen el mismo pipeline, sus mensajes no se rompen -----------------


async def test_bot_message_content_goes_through_the_same_schema_validation(
    client: AsyncClient,
) -> None:
    """`app/modules/bots/runner.py` construye `ChatMessageCreate(content=content)`
    exactamente igual que el endpoint HTTP -- hereda automáticamente todo el
    hardening de esta fase (`extra=forbid`, `sanitize_chat_text`) sin ningún camino
    aparte. Acá se verifica a nivel de schema (no hace falta levantar un bot real): un
    texto típico de bot pasa igual que cualquier mensaje de usuario."""
    message = ChatMessageCreate(content="Voy por este lote.")
    assert message.content == "Voy por este lote."


# --- Normalización de caracteres de control / bidi (Fase 5, sección 8) -----------------


async def test_ansi_escape_sequence_is_stripped_but_text_stays_readable(
    client: AsyncClient,
) -> None:
    owner_token = await _owner(client, "xss14-owner@example.com")
    remate = await _create_and_schedule_remate(client, owner_token)
    payload = "hola \x1b[31mrojo\x1b[0m mundo"

    r = await _send(client, owner_token, remate["id"], payload)

    assert r.status_code == 201, r.text
    assert r.json()["content"] == "hola [31mrojo[0m mundo"
    assert "\x1b" not in r.json()["content"]


async def test_null_byte_is_stripped(client: AsyncClient) -> None:
    owner_token = await _owner(client, "xss15-owner@example.com")
    remate = await _create_and_schedule_remate(client, owner_token)

    r = await _send(client, owner_token, remate["id"], "antes\x00despues")

    assert r.status_code == 201, r.text
    assert r.json()["content"] == "antesdespues"


async def test_bidi_override_character_is_stripped(client: AsyncClient) -> None:
    owner_token = await _owner(client, "xss16-owner@example.com")
    remate = await _create_and_schedule_remate(client, owner_token)
    payload = "spoof" + "‮" + "txt"

    r = await _send(client, owner_token, remate["id"], payload)

    assert r.status_code == 201, r.text
    assert r.json()["content"] == "spooftxt"


async def test_multiline_message_and_emoji_are_preserved(client: AsyncClient) -> None:
    """La normalización NO debe romper saltos de línea legítimos (Shift+Enter en
    `ChatInput.tsx`) ni emojis compuestos (familia, con Zero Width Joiner U+200D)."""
    owner_token = await _owner(client, "xss17-owner@example.com")
    remate = await _create_and_schedule_remate(client, owner_token)
    family_emoji = "\U0001F468‍\U0001F469‍\U0001F467"
    payload = f"primera linea\nsegunda linea con {family_emoji} y ñañó café"

    r = await _send(client, owner_token, remate["id"], payload)

    assert r.status_code == 201, r.text
    assert r.json()["content"] == payload


def test_sanitize_chat_text_unit_examples() -> None:
    """Unidad directa de `sanitize_chat_text`, sin pasar por HTTP -- cubre casos que ya
    verifican los tests de integración de arriba, más rápido de correr."""
    assert sanitize_chat_text("a\r\nb\rc") == "a\nb\nc"
    assert sanitize_chat_text("<script>alert(1)</script>") == "<script>alert(1)</script>"
    assert sanitize_chat_text("tab\there") == "tab\there"


# --- Mensajes de sistema: interpolan datos de usuario (moderación) ---------------------


async def test_moderation_system_message_sanitizes_the_interpolated_user_name(
    client: AsyncClient, db_engine
) -> None:
    """`_moderation_user_kicked_text` interpola `payload["user_name"]` (el `full_name`
    de la persona expulsada, un dato que ESE usuario eligió al registrarse) directo en
    el texto del mensaje de sistema -- si ese nombre trae caracteres de
    control/bidi-override, deben quedar normalizados igual que un mensaje de usuario
    común, porque termina en la misma columna `ChatMessage.content`, renderizada por el
    mismo componente."""

    class _RecordingEventBus:
        def __init__(self) -> None:
            self.published: list[DomainEvent] = []

        async def publish(self, event: DomainEvent) -> None:
            self.published.append(event)

    owner_token = await _owner(client, "xss18-owner@example.com")
    remate = await _create_and_schedule_remate(client, owner_token)

    redis_client = Redis.from_url(get_settings().REDIS_URL, decode_responses=True)
    try:
        session_factory = async_sessionmaker(bind=db_engine, expire_on_commit=False)
        dispatcher = ChatSystemEventDispatcher(
            session_factory, _RecordingEventBus(), RedisRateLimiter(redis_client), get_settings()
        )

        malicious_name = "Juan\x1b[31mMalicioso"
        raw_payload = json.dumps(
            {
                "event_type": "moderacion.usuario_expulsado",
                "remate_id": remate["id"],
                "event_id": str(uuid_module.uuid4()),
                "user_name": malicious_name,
            }
        )

        await dispatcher.dispatch(raw_payload)

        async with session_factory() as session:
            rows = (await session.execute(select(ChatMessage))).scalars().all()
            assert len(rows) == 1
            assert "\x1b" not in rows[0].content
            assert rows[0].content == "Juan[31mMalicioso fue expulsado del remate."
    finally:
        await redis_client.flushdb()
        await redis_client.aclose()
