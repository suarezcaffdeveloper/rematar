"""`PresenceService` (Épica 6, Módulo 6.2). Ver docs/33-sistema-de-presencia.md y
ADR-036.

Compone `RoomManager`/`ConnectionManager` (`app/websocket/`, sin modificarlos) y
`EventBus` (`app/events/`, sin modificarlo) -- mismo patrón que ya usa
`SnapshotService` (`app/snapshot/service.py`, Módulo 3.6): un paquete nuevo que orquesta
infraestructura ya existente, en vez de inyectarle un `EventBus` a `RoomManager` (lo
que rompería su firma de cero argumentos y los tests que ya lo instancian así, además
de violar el invariante explícito de ADR-024 -- "`RoomManager` no importa nada de
`app/events/`").

Es, a propósito, el punto central de presencia que el enunciado pide ("Presence Service
desacoplado", "preparado para Chat/Moderación/Seguimiento/Estadísticas"): expone
primitivas (`connected_users_summary`, `global_stats`) reutilizables por cualquier
feature futura de presencia, sin acoplarlas a WebSocket ni al Snapshot Service.
"""

import uuid

import structlog

from app.events.bus import EventBus
from app.presence.events import PresenceUserConnected, PresenceUserDisconnected
from app.presence.schemas import ConnectedUserSummary, PresenceGlobalStats
from app.websocket.manager import ConnectionManager
from app.websocket.rooms import RoomManager

logger = structlog.get_logger(__name__)


class PresenceService:
    def __init__(
        self,
        room_manager: RoomManager,
        connection_manager: ConnectionManager,
        event_bus: EventBus,
    ) -> None:
        self._room_manager = room_manager
        self._connection_manager = connection_manager
        self._event_bus = event_bus

    async def join_room(
        self, remate_id: uuid.UUID, connection_id: uuid.UUID, user_id: uuid.UUID
    ) -> bool:
        """Delega en `RoomManager.join` (semántica sin cambios: `False` si la conexión
        ya está en otra sala). Publica `PresenceUserConnected` únicamente cuando la
        membresía es realmente nueva -- un re-join idempotente (pedir unirse a la sala
        en la que ya se está) no genera ruido de presencia."""
        current_room = self._room_manager.room_id_for_connection(connection_id)
        already_in_target_room = current_room == remate_id
        joined = await self._room_manager.join(remate_id, connection_id)
        if joined and not already_in_target_room:
            await self._publish_connected(remate_id, connection_id, user_id)
        return joined

    async def leave_room(
        self, connection_id: uuid.UUID, user_id: uuid.UUID
    ) -> uuid.UUID | None:
        """Delega en `RoomManager.leave` (semántica sin cambios: `None` si la conexión
        no estaba en ninguna sala -- no publica nada en ese caso, no es un evento de
        presencia real)."""
        remate_id = await self._room_manager.leave(connection_id)
        if remate_id is not None:
            await self._publish_disconnected(remate_id, connection_id, user_id)
        return remate_id

    def connected_users_summary(self, remate_id: uuid.UUID) -> list[ConnectedUserSummary]:
        """Fuente única del conteo Y del detalle -- cualquier llamador deriva el conteo
        con `len(...)` de esta misma lista, nunca con una llamada separada a
        `RoomManager.connection_count`, para que ambos números nunca puedan discrepar.
        Salta conexiones que ya no están en `ConnectionManager` (se desconectaron entre
        que `RoomManager` armó la lista y esta lectura) -- misma tolerancia que
        `EventDispatcher.dispatch` (`app/realtime/dispatcher.py`)."""
        summaries = []
        for connection_id in self._room_manager.connections_in_room(remate_id):
            context = self._connection_manager.get(connection_id)
            if context is None:
                continue
            summaries.append(
                ConnectedUserSummary(
                    connection_id=context.connection_id,
                    user_id=context.user_id,
                    connected_at=context.connected_at,
                )
            )
        return summaries

    def global_stats(self) -> PresenceGlobalStats:
        return PresenceGlobalStats(
            active_rooms=self._room_manager.room_count(),
            total_connections=self._connection_manager.count(),
        )

    async def _publish_connected(
        self, remate_id: uuid.UUID, connection_id: uuid.UUID, user_id: uuid.UUID
    ) -> None:
        connected_users = len(self.connected_users_summary(remate_id))
        await self._event_bus.publish(
            PresenceUserConnected(
                remate_id=remate_id,
                connection_id=connection_id,
                user_id=user_id,
                connected_users=connected_users,
            )
        )
        logger.info(
            "presence_user_connected",
            remate_id=str(remate_id),
            connection_id=str(connection_id),
            user_id=str(user_id),
            connected_users=connected_users,
        )

    async def _publish_disconnected(
        self, remate_id: uuid.UUID, connection_id: uuid.UUID, user_id: uuid.UUID
    ) -> None:
        connected_users = len(self.connected_users_summary(remate_id))
        await self._event_bus.publish(
            PresenceUserDisconnected(
                remate_id=remate_id,
                connection_id=connection_id,
                user_id=user_id,
                connected_users=connected_users,
            )
        )
        logger.info(
            "presence_user_disconnected",
            remate_id=str(remate_id),
            connection_id=str(connection_id),
            user_id=str(user_id),
            connected_users=connected_users,
        )
