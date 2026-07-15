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
"""

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
    connected_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    last_pong_at: datetime = field(default_factory=lambda: datetime.now(UTC))


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
