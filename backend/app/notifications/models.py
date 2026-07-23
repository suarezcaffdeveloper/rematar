"""Modelo de `Notification` (Épica 7, Módulo 7.5). Ver docs/41-gestion-post-remate.md y
ADR-044.

`user_id` con `ondelete="RESTRICT"`: a diferencia de `AuditLogEntry` (que debe sobrevivir
a que el actor desaparezca), acá el destinatario **es** el dueño del recurso -- no hay
notificación sin destinatario, así que no tiene sentido dejarla huérfana con un `SET
NULL`. `resource_type`/`resource_id`/`remate_id` son un namespace abierto (mismo criterio
que `AuditLogEntry`, sin FK real hacia el recurso referenciado): este módulo es genérico,
no conoce qué es un "postauction_case".
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, Text, func, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base_class import Base
from app.db.mixins import UUIDPrimaryKeyMixin


class Notification(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "notifications"
    __table_args__ = (
        Index("ix_notifications_user_id_created_at", "user_id", "created_at"),
        # Parcial: solo indexa las filas no leídas -- es exactamente el subconjunto que
        # consulta `count_unread`/`list_for_user(unread_only=True)`, mismo criterio que
        # `ix_lotes_open_timer_ends_at` (`lotes/models.py`).
        Index(
            "ix_notifications_user_id_unread",
            "user_id",
            postgresql_where=text("read_at IS NULL"),
        ),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # Namespace abierto ("dominio.evento"), mismo criterio que `AuditLogEntry.action`.
    type: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)

    resource_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    resource_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    remate_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)

    # `None` significa "no leída" -- sin columna booleana redundante, mismo criterio que
    # `SoftDeleteMixin.deleted_at` (`app/db/mixins.py`): un único campo es tanto la marca
    # de estado como el timestamp de cuándo ocurrió.
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    def __repr__(self) -> str:
        return f"<Notification id={self.id} user_id={self.user_id} type={self.type!r}>"
