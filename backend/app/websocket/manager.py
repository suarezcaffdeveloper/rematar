"""Administrador centralizado de conexiones (Épica 3, Módulo 3.3). Ver
docs/20-gateway-websocket.md y ADR-023, sección B.

Un único `ConnectionManager` por proceso, creado en el `lifespan` de `app/main.py` —
mismo patrón que el cliente Redis compartido (Módulo 3.1). Registro en memoria
(`dict[UUID, ConnectionContext]`), sin locking explícito: una instancia de backend
corre en un único event loop, y una mutación de `dict` entre puntos de `await` es
atómica en asyncio.

Deliberadamente sin ningún concepto de "sala" — indexar por algo que todavía no existe
(ej. `remate_id`) sería inventar una sala disfrazada. `connections_for_user` es el único
agrupamiento con sentido en esta fase.

## `session_id` y `close_connections` (Fase 3 de remediación del WebSocket Security
## Audit — invalidación de conexiones)

`ConnectionContext.session_id` es el mismo `RefreshToken.id` (claim `sid` del access
token, ver `app/modules/auth/security.py::create_access_token`) que ya identifica una
sesión por HTTP — no un concepto nuevo, solo ahora también viaja a la conexión WS que
esa sesión abrió. `None` para conexiones autenticadas con un access token emitido antes
de la Fase 3 (sin claim `sid`) o si el JWT no lo trae por cualquier motivo — un intento
de cerrar por `session_id` nunca alcanza a esas conexiones, pero cerrar por `user_id`
completo (revoke-all: cambio de contraseña, suspensión) sí, porque no depende del
claim.

`close_connections` es la única operación de cierre por invalidación de sesión — no se
agregaron `close_connection`/`disconnect_session`/`disconnect_user` por separado: los
tres casos (una sesión puntual, todas las de un usuario) son el mismo filtro con
`session_id` opcional.

`close_connections` NO cierra el socket directamente. Solo marca
`ConnectionContext.invalidated` (un `asyncio.Event`) con el código/motivo de cierre --
es `_run_connection_loop` (`app/websocket/router.py`), la propia tarea dueña de esa
conexión, quien nota la señal y se cierra a sí misma, exactamente el mismo patrón que
ya usa para el timeout de heartbeat (`safe_close` + `return`, dejando que el `finally`
de `websocket_gateway` haga el cleanup de siempre).

Se descartó deliberadamente la alternativa obvia -- cerrar el socket desde acá
directamente (`WebSocket.close()`), como ya hace `ModerationService.kick_user`
(`app/moderation/service.py`) -- tras verificarla empíricamente con un test de
integración real (no alcanza con leer el código): `_run_connection_loop` puede estar
bloqueada en `await websocket.receive_text()` esperando el próximo mensaje del cliente,
y cerrar el socket desde OTRA tarea no interrumpe esa espera por sí solo -- en el mejor
caso, el cliente sí recibe el frame de cierre pero el propio `ConnectionManager` no se
entera de nada hasta el próximo `ping` de heartbeat (hasta `WS_PING_INTERVAL_SECONDS`,
20s por default) y deja una entrada húrfana en `_connections`/`RoomManager` mientras
tanto; cancelar la tarea "dueña" desde afuera para forzar ese `finally` de inmediato
tampoco es viable de forma confiable: bajo `TestClient` (y potencialmente bajo otros
runners ASGI), `asyncio.current_task()` capturado dentro de `websocket_gateway` no
identifica de forma fiable, para cancelar, exactamente la tarea que hay que cancelar
(se verificó que el `Task` resultante no es exclusivo de esta conexión bajo el modelo
de "portal" de `anyio`/`TestClient`). La señal cooperativa (`asyncio.Event`) evita
depender de ninguna de las dos suposiciones: la propia conexión decide cuándo cerrarse,
sin que nadie de afuera tenga que adivinar en qué tarea/punto de ejecución está.
"""

import asyncio
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime

import structlog
from fastapi import WebSocket

logger = structlog.get_logger(__name__)


@dataclass
class ConnectionContext:
    connection_id: uuid.UUID
    user_id: uuid.UUID
    websocket: WebSocket
    session_id: uuid.UUID | None = None
    connected_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    last_pong_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    # Fase 3: señal cooperativa de invalidación de sesión -- ver docstring del módulo.
    # `invalidation_code`/`invalidation_reason` solo tienen sentido una vez que
    # `invalidated` está seteado (`ConnectionManager.close_connections` fija los tres
    # juntos, en ese orden, antes de hacer `.set()`).
    invalidated: asyncio.Event = field(default_factory=asyncio.Event)
    invalidation_code: int = 0
    invalidation_reason: str = ""


class ConnectionManager:
    def __init__(self) -> None:
        self._connections: dict[uuid.UUID, ConnectionContext] = {}

    async def register(self, context: ConnectionContext) -> None:
        self._connections[context.connection_id] = context
        logger.info(
            "ws_connection_registered",
            connection_id=str(context.connection_id),
            user_id=str(context.user_id),
            active_connections=len(self._connections),
        )

    async def unregister(self, connection_id: uuid.UUID) -> None:
        context = self._connections.pop(connection_id, None)
        if context is not None:
            logger.info(
                "ws_connection_unregistered",
                connection_id=str(connection_id),
                user_id=str(context.user_id),
                active_connections=len(self._connections),
            )

    def get(self, connection_id: uuid.UUID) -> ConnectionContext | None:
        return self._connections.get(connection_id)

    def connections_for_user(self, user_id: uuid.UUID) -> list[ConnectionContext]:
        return [c for c in self._connections.values() if c.user_id == user_id]

    async def close_connections(
        self, *, user_id: uuid.UUID, session_id: uuid.UUID | None, code: int, reason: str
    ) -> int:
        """Marca para cierre las conexiones activas de `user_id` -- únicamente la de
        `session_id` si se pasa uno, todas las de ese usuario si `session_id=None` (ver
        docstring del módulo). Devuelve cuántas se marcaron (no espera a que
        efectivamente terminen de cerrarse -- eso lo decide cada conexión por su
        cuenta, ver `_run_connection_loop`). Nunca lanza: solo setea estado en memoria,
        sin I/O."""
        targets = [
            context
            for context in self._connections.values()
            if context.user_id == user_id
            and (session_id is None or context.session_id == session_id)
        ]
        for context in targets:
            context.invalidation_code = code
            context.invalidation_reason = reason
            context.invalidated.set()
        if targets:
            logger.info(
                "ws_connections_marked_invalidated",
                user_id=str(user_id),
                session_id=str(session_id) if session_id else None,
                marked_count=len(targets),
            )
        return len(targets)

    def list_connections(self) -> list[ConnectionContext]:
        return list(self._connections.values())

    def count(self) -> int:
        return len(self._connections)

    async def close_all(self, *, code: int, reason: str) -> None:
        """Cierre prolijo de todas las conexiones activas — usado desde el `lifespan`
        al apagar la aplicación, para que ningún cliente quede con un socket cortado
        abruptamente sin motivo."""
        for context in list(self._connections.values()):
            try:
                await context.websocket.close(code=code, reason=reason)
            except Exception:
                logger.exception(
                    "ws_close_all_failed_for_connection",
                    connection_id=str(context.connection_id),
                )
        self._connections.clear()
