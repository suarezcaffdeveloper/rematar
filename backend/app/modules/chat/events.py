"""Catálogo de eventos de dominio del Chat (Épica 6, Módulo 6.4). Ver
docs/34-chat-del-remate.md y ADR-037.

Convención de nombres: sustantivo en español + verbo en inglés (`chat.message_sent`,
`chat.message_deleted`, `chat.user_typing`), la misma que ya usa la mayoría del
catálogo (`remate.started`, `lote.opened`, `oferta.accepted`) -- a diferencia de los
dos eventos de presencia (`presencia.usuario_conectado`/`desconectado`), que usaron
español completo porque ya estaban reservados así desde Fase 0
(`docs/06-eventos-del-sistema.md`, ver ADR-036). El chat no tiene ningún nombre
pre-reservado, así que sigue la convención dominante.

`ChatMessageSent` lleva todos los campos necesarios para que el frontend pinte el
mensaje sin ninguna consulta adicional -- mismo criterio que `LoteOpened` (lleva
`lot_number`/`display_order`, no solo el id). `ChatMessageDeleted` lleva únicamente
`message_id`: el frontend ya tiene el mensaje en memoria (llegó antes por
`ChatMessageSent` o por el historial inicial), solo necesita saber cuál marcar como
eliminado. `ChatUserTyping` no persiste nada -- mismo criterio que los eventos de
presencia, que tampoco tienen fila en la base.

`ChatUserTyping` lleva `user_id` pero, a propósito, **no** `connection_id` (a
diferencia de `PresenceUserConnected`/`Disconnected`, `app/presence/events.py`): el
indicador de escritura se dispara por HTTP (`POST .../chat/typing`, sin abrir el
Gateway WebSocket a un tipo de mensaje nuevo, ver ADR-037), una acción sin ninguna
conexión WebSocket asociada de forma natural -- si el mismo usuario tiene varias
pestañas abiertas, todas disparan el mismo aviso "está escribiendo", lo cual es
exactamente el comportamiento esperado (no hace falta distinguir la pestaña).
"""

import uuid
from datetime import datetime
from typing import Literal

from app.events.base import RemateScopedEvent
from app.modules.chat.models import ChatMessageKind


class ChatMessageSent(RemateScopedEvent):
    event_type: Literal["chat.message_sent"] = "chat.message_sent"
    message_id: uuid.UUID
    kind: ChatMessageKind
    author_id: uuid.UUID | None
    author_name: str | None
    author_role: str | None
    content: str
    system_event_type: str | None
    created_at: datetime


class ChatMessageDeleted(RemateScopedEvent):
    event_type: Literal["chat.message_deleted"] = "chat.message_deleted"
    message_id: uuid.UUID


class ChatUserTyping(RemateScopedEvent):
    event_type: Literal["chat.user_typing"] = "chat.user_typing"
    user_id: uuid.UUID
    user_name: str
