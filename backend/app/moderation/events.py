"""Catálogo de eventos de dominio del Moderation Service (Épica 7, Módulo 7.6). Ver
docs/42-moderacion-en-tiempo-real.md y ADR-045.

Namespace `moderacion.*` -- sustantivo en español + verbo en inglés, la convención
dominante del catálogo (`chat.message_sent`, `oferta.rejected`, `lote.opened`), no la de
`postauction`/`audit` (nombres de paquete en inglés, sin sustantivo español equivalente
ya establecido): "moderación" es un concepto de dominio de la sala en vivo, igual que
chat/ofertas, así que sigue la misma convención que ellos.
"""

import uuid
from typing import Literal

from app.events.base import RemateScopedEvent


class ModerationUserKicked(RemateScopedEvent):
    event_type: Literal["moderacion.usuario_expulsado"] = "moderacion.usuario_expulsado"
    user_id: uuid.UUID
    user_name: str | None
    banned_by: uuid.UUID
    reason: str | None


class ModerationUserMuted(RemateScopedEvent):
    event_type: Literal["moderacion.usuario_silenciado"] = "moderacion.usuario_silenciado"
    user_id: uuid.UUID
    user_name: str | None
    muted_by: uuid.UUID
    duration_seconds: int


class ModerationChatLocked(RemateScopedEvent):
    event_type: Literal["moderacion.chat_bloqueado"] = "moderacion.chat_bloqueado"
    locked_by: uuid.UUID
    duration_seconds: int


class ModerationMessagePinned(RemateScopedEvent):
    event_type: Literal["moderacion.mensaje_destacado"] = "moderacion.mensaje_destacado"
    message_id: uuid.UUID
    pinned_by: uuid.UUID


class ModerationMessageUnpinned(RemateScopedEvent):
    event_type: Literal["moderacion.mensaje_no_destacado"] = "moderacion.mensaje_no_destacado"
    message_id: uuid.UUID


class ModerationInvalidBidThresholdExceeded(RemateScopedEvent):
    """Solo llega al rematador (vía `Notification`, no al chat público -- ver
    docstring de `chat/realtime.py`: publicar el patrón de ofertas fallidas de un
    comprador en un canal visible para todos sería una filtración de privacidad)."""

    event_type: Literal["moderacion.umbral_ofertas_invalidas_superado"] = (
        "moderacion.umbral_ofertas_invalidas_superado"
    )
    buyer_id: uuid.UUID
    attempt_count: int
    threshold: int
