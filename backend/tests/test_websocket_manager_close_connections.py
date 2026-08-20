"""Tests unitarios de `ConnectionManager.close_connections` y
`SessionInvalidationDispatcher` (Fase 3 de remediación del WebSocket Security Audit) --
en memoria, sin Redis/Postgres reales, mismo criterio que `test_realtime_dispatcher.py`.

`close_connections` NO cierra el socket directamente (ver su docstring en
`app/websocket/manager.py` para el porqué: se verificó empíricamente que hacerlo desde
afuera de la propia tarea de la conexión no interrumpe de forma confiable un
`receive_text()` ya en curso) -- solo marca `ConnectionContext.invalidated`
(`asyncio.Event`) + `invalidation_code`/`invalidation_reason`. Es
`_run_connection_loop` (`app/websocket/router.py`) quien nota la señal y se cierra a sí
misma -- ESE mecanismo se verifica de punta a punta, con Postgres/Redis/WebSocket
reales, en `tests/test_websocket_session_invalidation.py`; acá se aísla exclusivamente
si `close_connections` marca las conexiones correctas (y solo esas).
"""

import json
import uuid

from app.modules.auth.realtime import SessionInvalidationDispatcher
from app.websocket import close_codes
from app.websocket.manager import ConnectionContext, ConnectionManager


class _FakeWebSocket:
    """No se usa para cerrar nada acá (ver docstring del módulo) -- solo hace falta
    para satisfacer el tipo de `ConnectionContext.websocket`."""


def _context(*, user_id: uuid.UUID, session_id: uuid.UUID | None) -> ConnectionContext:
    return ConnectionContext(
        connection_id=uuid.uuid4(),
        user_id=user_id,
        session_id=session_id,
        websocket=_FakeWebSocket(),
    )


# --- ConnectionManager.close_connections ----------------------------------------------


async def test_close_connections_by_session_id_marks_only_that_session() -> None:
    manager = ConnectionManager()
    user_id = uuid.uuid4()
    session_a, session_b = uuid.uuid4(), uuid.uuid4()
    ctx_a = _context(user_id=user_id, session_id=session_a)
    ctx_b = _context(user_id=user_id, session_id=session_b)
    await manager.register(ctx_a)
    await manager.register(ctx_b)

    marked = await manager.close_connections(
        user_id=user_id, session_id=session_a, code=close_codes.UNAUTHORIZED, reason="x"
    )

    assert marked == 1
    assert ctx_a.invalidated.is_set()
    assert ctx_a.invalidation_code == close_codes.UNAUTHORIZED
    assert ctx_a.invalidation_reason == "x"
    assert not ctx_b.invalidated.is_set()


async def test_close_connections_with_no_session_id_marks_all_of_the_user() -> None:
    manager = ConnectionManager()
    user_id = uuid.uuid4()
    ctx_a = _context(user_id=user_id, session_id=uuid.uuid4())
    ctx_b = _context(user_id=user_id, session_id=uuid.uuid4())
    ctx_c = _context(user_id=user_id, session_id=None)  # token pre-Fase-3, sin `sid`
    await manager.register(ctx_a)
    await manager.register(ctx_b)
    await manager.register(ctx_c)

    marked = await manager.close_connections(
        user_id=user_id, session_id=None, code=close_codes.UNAUTHORIZED, reason="x"
    )

    assert marked == 3
    assert all(ctx.invalidated.is_set() for ctx in (ctx_a, ctx_b, ctx_c))


async def test_close_connections_never_touches_another_users_connections() -> None:
    manager = ConnectionManager()
    user_a, user_b = uuid.uuid4(), uuid.uuid4()
    ctx_a = _context(user_id=user_a, session_id=None)
    ctx_b = _context(user_id=user_b, session_id=None)
    await manager.register(ctx_a)
    await manager.register(ctx_b)

    marked = await manager.close_connections(
        user_id=user_a, session_id=None, code=close_codes.UNAUTHORIZED, reason="x"
    )

    assert marked == 1
    assert ctx_a.invalidated.is_set()
    assert not ctx_b.invalidated.is_set()


async def test_close_connections_with_no_matching_connections_is_a_safe_no_op() -> None:
    manager = ConnectionManager()
    marked = await manager.close_connections(
        user_id=uuid.uuid4(), session_id=None, code=close_codes.UNAUTHORIZED, reason="x"
    )
    assert marked == 0


# --- SessionInvalidationDispatcher ------------------------------------------------------


def _event_json(*, user_id: uuid.UUID, session_id: uuid.UUID | None, reason: str = "logout") -> str:
    return json.dumps(
        {
            "event_type": "auth.session_invalidated",
            "event_id": str(uuid.uuid4()),
            "occurred_at": "2026-01-01T00:00:00Z",
            "user_id": str(user_id),
            "session_id": str(session_id) if session_id else None,
            "reason": reason,
        }
    )


async def test_dispatcher_marks_the_matching_connection() -> None:
    manager = ConnectionManager()
    user_id = uuid.uuid4()
    session_id = uuid.uuid4()
    ctx = _context(user_id=user_id, session_id=session_id)
    await manager.register(ctx)

    dispatcher = SessionInvalidationDispatcher(manager)
    await dispatcher.dispatch(_event_json(user_id=user_id, session_id=session_id))

    assert ctx.invalidated.is_set()


async def test_dispatcher_ignores_unrelated_event_types() -> None:
    manager = ConnectionManager()
    user_id = uuid.uuid4()
    ctx = _context(user_id=user_id, session_id=None)
    await manager.register(ctx)

    dispatcher = SessionInvalidationDispatcher(manager)
    unrelated = json.dumps({"event_type": "remate.started", "remate_id": str(uuid.uuid4())})
    await dispatcher.dispatch(unrelated)

    assert not ctx.invalidated.is_set()


async def test_dispatcher_ignores_invalid_json_without_raising() -> None:
    dispatcher = SessionInvalidationDispatcher(ConnectionManager())
    await dispatcher.dispatch("esto no es json")  # no debe lanzar


async def test_dispatcher_ignores_malformed_payload_without_raising() -> None:
    dispatcher = SessionInvalidationDispatcher(ConnectionManager())
    broken = json.dumps({"event_type": "auth.session_invalidated"})  # sin user_id
    await dispatcher.dispatch(broken)  # no debe lanzar
