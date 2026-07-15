"""Envelope de salida para eventos de dominio reenviados a clientes (Épica 3, Módulo
3.5). Ver docs/22-sincronizacion-tiempo-real.md.

Subclasea `WSMessage` (`app/websocket/messages.py`, Módulo 3.3) **sin modificarlo** —
mismo `schema_version`/`type` discriminador que el resto del protocolo del Gateway, para
que un cliente no tenga que distinguir "mensajes de conexión" de "mensajes de dominio"
por ningún criterio especial. El Gateway (`app/websocket/`) no importa nada de este
archivo: es este paquete el que depende del Gateway, nunca al revés.
"""

import uuid
from datetime import datetime
from typing import Any, Literal

from app.websocket.messages import WSMessage


class DomainEventMessage(WSMessage):
    """Un evento de dominio (`RemateStarted`, `OfertaAccepted`, etc.) traducido al
    protocolo del Gateway. `payload` es el `model_dump(mode="json")` completo del
    evento original — incluye `event_id`/`occurred_at`/`event_type`/`remate_id` más los
    campos propios de cada evento; `event_type` y `remate_id` se repiten también en el
    nivel superior para que el cliente pueda enrutar/filtrar sin tener que mirar dentro
    de `payload`."""

    type: Literal["domain_event"] = "domain_event"
    event_type: str
    remate_id: uuid.UUID
    occurred_at: datetime
    payload: dict[str, Any]
