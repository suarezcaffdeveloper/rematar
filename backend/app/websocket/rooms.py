"""Administrador centralizado de salas (Épica 3, Módulo 3.4). Ver
docs/21-sistema-de-salas.md y ADR-024.

Un único `RoomManager` por proceso, creado en el `lifespan` de `app/main.py` — mismo
patrón que `ConnectionManager` (Módulo 3.3). Dos `dict` en memoria mantenidos
sincronizados entre sí (`remate_id -> {connection_id, ...}` y su índice inverso
`connection_id -> remate_id`), sin locking explícito: mismo razonamiento que
`ConnectionManager` (una instancia de backend, un único event loop, mutaciones de
`dict`/`set` atómicas entre puntos de `await`).

Deliberadamente independiente de `ConnectionManager` y sin ninguna validación de
dominio sobre `remate_id` (ver ADR-024, secciones A y D) — no importa nada de
`app/modules/` ni de `app/events/`, misma disciplina de límites que el resto de
`app/websocket/`.
"""

import uuid

import structlog

logger = structlog.get_logger(__name__)

# Códigos de error del protocolo de salas (`ErrorMessage.code`, ver messages.py y
# docs/21-sistema-de-salas.md). Nunca cierran la conexión — a diferencia de los
# `close_codes` de autenticación (ADR-023), son recuperables en la misma conexión.
ERROR_INVALID_ROOM_ID = "invalid_room_id"
ERROR_ALREADY_IN_ROOM = "already_in_room"
ERROR_NOT_IN_ROOM = "not_in_room"
# Fase 4 de remediación del WebSocket Security Audit -- ver app/websocket/rate_limit.py.
# `join_room`/`leave_room` superó el límite de acciones de sala por usuario. Recuperable
# en la misma conexión (no cierra el socket) -- a diferencia de un abuso genérico de
# mensajes, un usuario navegando rápido entre remates es tráfico legítimo, no un ataque.
ERROR_RATE_LIMITED = "rate_limited"


class RoomManager:
    def __init__(self) -> None:
        self._rooms: dict[uuid.UUID, set[uuid.UUID]] = {}
        self._connection_room: dict[uuid.UUID, uuid.UUID] = {}

    async def join(self, remate_id: uuid.UUID, connection_id: uuid.UUID) -> bool:
        """Une la conexión a la sala `remate_id`, creándola si es la primera conexión.
        Devuelve `False` sin efecto si la conexión ya está en una sala **distinta** —
        el llamador debe salir explícitamente antes de unirse a otra (ADR-024, sección
        B). Pedir unirse a la sala en la que ya está es idempotente (devuelve `True`,
        sin cambiar nada)."""
        current_room = self._connection_room.get(connection_id)
        if current_room is not None and current_room != remate_id:
            return False
        if current_room == remate_id:
            return True

        is_new_room = remate_id not in self._rooms
        self._connection_room[connection_id] = remate_id
        self._rooms.setdefault(remate_id, set()).add(connection_id)
        logger.info(
            "ws_room_joined",
            remate_id=str(remate_id),
            connection_id=str(connection_id),
            room_connections=len(self._rooms[remate_id]),
            room_created=is_new_room,
        )
        return True

    async def leave(self, connection_id: uuid.UUID) -> uuid.UUID | None:
        """Saca la conexión de su sala actual, eliminando la sala si queda vacía.
        Devuelve el `remate_id` del que salió, o `None` si la conexión no estaba en
        ninguna sala — no es un error, pasa en cada desconexión de una conexión que
        nunca se unió a una sala."""
        remate_id = self._connection_room.pop(connection_id, None)
        if remate_id is None:
            return None

        room = self._rooms.get(remate_id)
        if room is None:
            return remate_id

        room.discard(connection_id)
        room_deleted = not room
        if room_deleted:
            del self._rooms[remate_id]
        logger.info(
            "ws_room_left",
            remate_id=str(remate_id),
            connection_id=str(connection_id),
            room_connections=len(room),
            room_deleted=room_deleted,
        )
        return remate_id

    def room_id_for_connection(self, connection_id: uuid.UUID) -> uuid.UUID | None:
        return self._connection_room.get(connection_id)

    def connections_in_room(self, remate_id: uuid.UUID) -> list[uuid.UUID]:
        return list(self._rooms.get(remate_id, ()))

    def connection_count(self, remate_id: uuid.UUID) -> int:
        return len(self._rooms.get(remate_id, ()))

    def room_count(self) -> int:
        return len(self._rooms)

    def total_connections(self) -> int:
        return len(self._connection_room)

    def list_rooms(self) -> list[uuid.UUID]:
        return list(self._rooms.keys())
