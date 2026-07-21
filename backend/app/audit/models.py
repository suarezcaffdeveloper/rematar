"""Modelo de `AuditLogEntry` (Épica 7, Módulo 7.2). Ver
docs/36-sistema-de-auditoria-y-trazabilidad.md y ADR-039.

Solo `UUIDPrimaryKeyMixin` -- deliberadamente sin `TimestampMixin` (no hay `updated_at`:
una entrada de auditoría nunca se modifica) ni `SoftDeleteMixin` (no hay `deleted_at`:
nunca se borra, ni siquiera lógicamente -- insert-only es la propiedad central que
distingue a esta tabla de todo lo demás en el proyecto, ver ADR-039 sección A).

`actor_name`/`actor_role` están denormalizados al momento del registro, mismo criterio
que `ChatMessage.author_name`/`author_role` (`app/modules/chat/models.py`): preservan
quién hizo qué y con qué rol *en ese momento*, aunque el usuario cambie de nombre, de rol
o se dé de baja después.

`action` es `String`, no un `Enum` nativo de Postgres -- ver el docstring de
`actions.py` para el razonamiento completo (extensibilidad sin migraciones).

Las FKs (`actor_id`, `remate_id`) usan `ondelete="SET NULL"`, al revés del criterio
`RESTRICT` que el resto del proyecto aplica a sus propias tablas de auditoría
(`ChatMessage.remate_id`, `Oferta.lote_id`): ahí `RESTRICT` protege a la entidad
*auditada* de desaparecer. Acá `AuditLogEntry` **es** el registro de auditoría -- debe
ser la tabla más tolerante posible a que la fila que referencia deje de existir, nunca
puede bloquear esa operación ni perder la entrada.
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base_class import Base
from app.db.mixins import UUIDPrimaryKeyMixin


class AuditLogEntry(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "audit_log_entries"
    __table_args__ = (
        Index("ix_audit_log_entries_remate_id_occurred_at", "remate_id", "occurred_at"),
    )

    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )

    # SET NULL: ver docstring del módulo. Nulo también para acciones sin actor humano
    # (ninguna hoy, preparado para automatismos futuros -- ej. finalización automática).
    actor_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    actor_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    actor_role: Mapped[str | None] = mapped_column(String(20), nullable=True)

    # Namespace abierto ("dominio.verbo") -- ver app/audit/actions.py.
    action: Mapped[str] = mapped_column(String(100), nullable=False, index=True)

    resource_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    resource_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)

    # Nulo en acciones no ligadas a un remate puntual (login/logout). Es la clave de
    # scoping que usa la vista del rematador (`AuditService.list_for_remate`).
    remate_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("remates.id", ondelete="SET NULL"), nullable=True, index=True
    )

    # Metadata libre por acción (motivo, campos modificados, monto, outcome, etc.). Se
    # llama `details`, no `metadata`: ese nombre está reservado por `Base.metadata`.
    details: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    def __repr__(self) -> str:
        return f"<AuditLogEntry id={self.id} action={self.action} resource_type={self.resource_type}>"
