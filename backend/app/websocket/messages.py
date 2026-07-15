"""Protocolo de mensajes propio del Gateway (Épica 3, Módulo 3.3). Ver
docs/20-gateway-websocket.md.

Mismo criterio que los eventos de dominio (`app/events/base.py`, Módulo 3.2): objetos
Pydantic con un campo `type` discriminador (`Literal[...]`), nunca `dict` sueltos ni
strings armados a mano. `schema_version` existe porque docs/06-eventos-del-sistema.md
(Fase 0) ya pedía que todo mensaje que cruza al cliente por WebSocket sea versionable,
para poder evolucionar el protocolo sin romper clientes viejos conectados durante un
despliegue.

Mensajes de **gestión de conexión** (`auth`, `connected`, `ping`, `pong`, `error`) y de
**gestión de salas** (Épica 3, Módulo 3.4 — `join_room`, `leave_room`, `room_joined`,
`room_left`; ver docs/21-sistema-de-salas.md). Ninguno es un mensaje de *dominio*: no
hay ofertas, remates ni lotes acá — eso queda para cuando este módulo se integre con el
Event Bus.
"""

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class WSMessage(BaseModel):
    schema_version: int = Field(default=1)
    type: str


class AuthMessage(WSMessage):
    """Primer mensaje esperado tras abrir la conexión (ADR-006)."""

    type: Literal["auth"] = "auth"
    token: str


class ConnectedMessage(WSMessage):
    """Respuesta a una autenticación exitosa."""

    type: Literal["connected"] = "connected"
    connection_id: UUID
    user_id: UUID


class PingMessage(WSMessage):
    type: Literal["ping"] = "ping"


class PongMessage(WSMessage):
    """Respuesta del cliente a un `ping` — mantiene la conexión viva (heartbeat)."""

    type: Literal["pong"] = "pong"


class ErrorMessage(WSMessage):
    type: Literal["error"] = "error"
    code: str
    message: str


class JoinRoomMessage(WSMessage):
    """Pide unirse a la sala del remate `remate_id` (Épica 3, Módulo 3.4)."""

    type: Literal["join_room"] = "join_room"
    remate_id: UUID


class LeaveRoomMessage(WSMessage):
    """Pide salir de la sala actual — no lleva `remate_id`: una conexión está, a lo
    sumo, en una sala a la vez (ADR-024, sección B)."""

    type: Literal["leave_room"] = "leave_room"


class RoomJoinedMessage(WSMessage):
    """Confirma una unión exitosa a `join_room` (incluye el caso idempotente de pedir
    unirse a la sala en la que ya se estaba)."""

    type: Literal["room_joined"] = "room_joined"
    remate_id: UUID


class RoomLeftMessage(WSMessage):
    """Confirma una salida exitosa de `leave_room`."""

    type: Literal["room_left"] = "room_left"
    remate_id: UUID
