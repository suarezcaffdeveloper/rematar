"""Catálogo de eventos de presencia (Épica 6, Módulo 6.2). Ver
docs/33-sistema-de-presencia.md y ADR-036.

Nombres (`event_type`) ya reservados desde Fase 0 en
docs/06-eventos-del-sistema.md — "eventos de presencia, no crítico",
"eventually consistent", "mejor esfuerzo, no fuente de verdad": una desincronización
de unos segundos tras una desconexión abrupta no es un bug crítico, a diferencia de un
evento de `Oferta`.

`connection_id` es imprescindible en ambos eventos: `RoomManager`/`ConnectionManager`
(`app/websocket/`) ya distinguen conexión de usuario -- dos pestañas del mismo
`user_id` son dos `connection_id` distintos en la misma sala. Sin `connection_id`, un
consumidor no podría reconciliar cuál de las dos conexiones de un mismo usuario se
desconectó.
"""

import uuid
from typing import Literal

from app.events.base import RemateScopedEvent


class PresenceUserConnected(RemateScopedEvent):
    event_type: Literal["presencia.usuario_conectado"] = "presencia.usuario_conectado"
    connection_id: uuid.UUID
    user_id: uuid.UUID
    connected_users: int


class PresenceUserDisconnected(RemateScopedEvent):
    event_type: Literal["presencia.usuario_desconectado"] = "presencia.usuario_desconectado"
    connection_id: uuid.UUID
    user_id: uuid.UUID
    connected_users: int
