"""Modelos del Moderation Service (Épica 7, Módulo 7.6). Ver
docs/42-moderacion-en-tiempo-real.md y ADR-045.

`RemateBan` es la única pieza de moderación que necesita sobrevivir un restart del
backend (a diferencia de silenciar/bloquear-chat, que son estado efímero en Redis, ver
`redis_state.py`): si se perdiera, un comprador expulsado podría reingresar. `user_id`/
`remate_id` en `ondelete="RESTRICT"` (registro de negocio, mismo criterio que
`PostAuctionCase`); `banned_by_id` en `SET NULL` (quién lo hizo, dato de auditoría, no
debe bloquear que ese usuario deje de existir -- mismo criterio que `ChatMessage.
deleted_by`).

`ModerationPinnedMessage` referencia `chat_messages.id` en `RESTRICT` de solo lectura --
`ChatMessage` no gana ninguna columna nueva (`is_pinned`, etc.); esta tabla es la única
fuente de verdad de qué mensaje está destacado, y vive acá para no tocar el modelo de
Chat en absoluto.
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base_class import Base
from app.db.mixins import UUIDPrimaryKeyMixin


class RemateBan(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "remate_bans"
    __table_args__ = (
        Index("uq_remate_bans_remate_id_user_id", "remate_id", "user_id", unique=True),
    )

    remate_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("remates.id", ondelete="RESTRICT"), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    banned_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    reason: Mapped[str | None] = mapped_column(String(500), nullable=True)
    banned_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    def __repr__(self) -> str:
        return f"<RemateBan id={self.id} remate_id={self.remate_id} user_id={self.user_id}>"


class ModerationPinnedMessage(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "moderation_pinned_messages"
    __table_args__ = (
        Index("uq_moderation_pinned_messages_message_id", "message_id", unique=True),
    )

    remate_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("remates.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    message_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("chat_messages.id", ondelete="RESTRICT"), nullable=False
    )
    pinned_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    pinned_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    def __repr__(self) -> str:
        return f"<ModerationPinnedMessage id={self.id} message_id={self.message_id}>"
