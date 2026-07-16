"""Mensaje de salida del snapshot inicial sobre el Gateway (Épica 3, Módulo 3.6). Ver
docs/23-snapshot-service.md.

Subclasea `WSMessage` (`app/websocket/messages.py`, Módulo 3.3) **sin modificarlo** —
mismo patrón que `app/realtime/messages.py` (Módulo 3.5) para `DomainEventMessage`.
"""

from typing import Literal

from app.snapshot.schemas import RemateStateSnapshot
from app.websocket.messages import WSMessage

# Código de error del protocolo (`ErrorMessage.code`) para cuando el snapshot no se
# pudo construir después de un `join_room` exitoso -- no cierra la conexión ni deshace
# la unión a la sala (mismo criterio que los errores de sala, ADR-024 sección F): es
# recuperable, el cliente sigue en la sala y puede reintentar (por ejemplo, mandando de
# nuevo `join_room`).
SNAPSHOT_UNAVAILABLE = "snapshot_unavailable"


class SnapshotMessage(WSMessage):
    """Se manda una única vez, inmediatamente después de `room_joined` -- nunca en
    respuesta a otro mensaje del cliente."""

    type: Literal["snapshot"] = "snapshot"
    data: RemateStateSnapshot
