"""Modelo de `ChatMessage` (Épica 6, Módulo 6.4 — Chat del Remate). Ver
docs/34-chat-del-remate.md y ADR-037.

`Chat` es su propio módulo top-level (`app/modules/chat/`), no un sub-paquete de
`remates` — mismo criterio que `Oferta` (`app/modules/ofertas/models.py`): una entidad
persistida con reglas de negocio propias (longitud, moderación, rate limiting), no un
adaptador sobre infraestructura ya existente (a diferencia de `presence`/`snapshot`).

`author_name`/`author_role` están **denormalizados** al momento de enviar el mensaje,
no resueltos por `JOIN` a `users` en cada lectura — decisión deliberada de escala
("miles de mensajes", ver ADR-037): evita un `JOIN` en la consulta más frecuente
(listar historial) y, además, preserva el nombre/rol que la persona tenía *en ese
momento* aunque cambien después. `author_role` es un `String(20)` plano, no el ENUM
nativo `user_role` (`app/modules/users/models.py`) — es un dato de auditoría histórico,
no una referencia viva: acoplarlo al catálogo vivo de roles (ADR-010) haría que un
cambio futuro de ese catálogo alterase silenciosamente la semántica de mensajes viejos,
y además evita la complejidad real de compartir un mismo tipo `ENUM` de Postgres entre
dos tablas/migraciones independientes.

`source_event_id` existe únicamente para mensajes de sistema (`kind=SYSTEM`): guarda el
`event_id` (`app/events/base.py::DomainEvent.event_id`) del evento de dominio que
originó el mensaje (`RemateStarted`, `LoteOpened`, etc.). El índice único parcial sobre
esta columna es lo que garantiza idempotencia en un despliegue con más de una instancia
de backend — cada instancia tiene su propio `ChatSystemEventDispatcher`
(`app/modules/chat/realtime.py`) reaccionando al mismo `PUBLISH` de Redis Pub/Sub; sin
este índice, cada instancia insertaría su propia fila duplicada del mismo mensaje. Ver
ADR-037, sección de idempotencia, para el análisis completo.
"""

import enum
import uuid

from sqlalchemy import Enum, ForeignKey, Index, String, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base_class import Base
from app.db.mixins import SoftDeleteMixin, TimestampMixin, UUIDPrimaryKeyMixin


class ChatMessageKind(str, enum.Enum):
    USER = "user"
    SYSTEM = "system"


def _enum_values(enum_cls: type[enum.Enum]) -> list[str]:
    return [member.value for member in enum_cls]


class ChatMessage(UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin, Base):
    """`SoftDeleteMixin` (`app/db/mixins.py`, ya usado por `Remate`) es lo que respalda
    la moderación: `ChatService.delete_message` nunca hace un `DELETE` físico -- fija
    `deleted_at`/`deleted_by`, mismo criterio de auditoría que el resto de la app."""

    __tablename__ = "chat_messages"
    __table_args__ = (
        Index("ix_chat_messages_remate_id_created_at", "remate_id", "created_at"),
        Index(
            "uq_chat_messages_source_event_id",
            "source_event_id",
            unique=True,
            postgresql_where=text("source_event_id IS NOT NULL"),
        ),
    )

    # RESTRICT: mismo criterio de auditoría que Oferta.lote_id -- un remate con
    # historial de chat nunca debería poder desaparecer por CASCADE (en la práctica un
    # Remate nunca se hard-delete, ver Remate.soft_delete, pero el criterio es el mismo
    # igual).
    remate_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("remates.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    kind: Mapped[ChatMessageKind] = mapped_column(
        Enum(
            ChatMessageKind,
            name="chat_message_kind",
            native_enum=True,
            values_callable=_enum_values,
        ),
        nullable=False,
    )

    # Nulo para kind=SYSTEM. SET NULL (no RESTRICT): un mensaje de chat es registro de
    # auditoría de la CONVERSACIÓN, no debería impedir que un usuario se elimine en el
    # futuro (todavía no existe esa funcionalidad, pero el criterio queda preparado).
    author_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    author_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    author_role: Mapped[str | None] = mapped_column(String(20), nullable=True)

    content: Mapped[str] = mapped_column(String(500), nullable=False)

    # Solo para kind=SYSTEM -- qué evento de dominio lo generó (ej. "remate.started"),
    # para que un futuro consumidor (filtro visual, analítica) no tenga que parsear el
    # texto de `content`.
    system_event_type: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # Quién moderó (además de `deleted_at`, ya provisto por SoftDeleteMixin).
    deleted_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    # Ver docstring del módulo -- solo para kind=SYSTEM, garantiza idempotencia.
    source_event_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)

    def __repr__(self) -> str:
        return f"<ChatMessage id={self.id} remate_id={self.remate_id} kind={self.kind.value}>"
