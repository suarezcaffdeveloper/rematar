"""DTOs del Presence Service (Épica 6, Módulo 6.2). Ver docs/33-sistema-de-presencia.md.

`ConnectedUserSummary` es propiedad de este paquete (no de `app/snapshot/`) porque es
el dato que `PresenceService` calcula -- `app/snapshot/schemas.py` lo importa desde
acá para incluirlo en `RemateStateSnapshot`, misma dirección de dependencia que ya usa
`app/realtime/messages.py` importando `WSMessage` desde `app.websocket.messages`
(el consumidor importa la forma que necesita, nunca al revés).
"""

import uuid
from datetime import datetime

from pydantic import BaseModel


class ConnectedUserSummary(BaseModel):
    """Una conexión activa dentro de una sala. No incluye nombre/email -- `PresenceService`
    se apoya únicamente en `RoomManager`/`ConnectionManager` (`app/websocket/`), que
    nunca conocieron `app.modules.users` -- ver "Limitaciones conocidas" en
    docs/33-sistema-de-presencia.md."""

    connection_id: uuid.UUID
    user_id: uuid.UUID
    connected_at: datetime


class PresenceGlobalStats(BaseModel):
    """Conteo global (todas las salas, todo el proceso) -- ver `GET /presence/global`
    en `router.py`."""

    active_rooms: int
    total_connections: int
