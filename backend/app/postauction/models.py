"""Modelos del PostAuction Service (Épica 7, Módulo 7.5). Ver
docs/41-gestion-post-remate.md y ADR-044.

`PostAuctionCase` es un registro de negocio vivo (mismo criterio que `Remate`/`Lote`, no
que `AuditLogEntry`): FKs con `ondelete="RESTRICT"` hacia `lotes`/`remates`/`users`, un
caso no puede quedar huérfano de su lote, remate, comprador o rematador. `lote_id` es
único -- a lo sumo un caso post-remate por lote (`create_case_from_winner` es idempotente
sobre esta restricción, ver `service.py`).

`PostAuctionTimelineEntry` es insert-only, mismo criterio estructural que
`AuditLogEntry` (actor denormalizado, `action` como string abierto) -- pero a diferencia
de auditoría, es hijo de un `PostAuctionCase` sin valor propio fuera de él (nadie consulta
un timeline sin su caso), así que usa `ondelete="CASCADE"` sobre `case_id`, no
`RESTRICT`/`SET NULL`.

`previous_status`/`new_status` reutilizan el tipo nativo `postauction_status` que ya crea
la columna `PostAuctionCase.status` -- `postgresql.ENUM(..., create_type=False)`, no el
`sqlalchemy.Enum` genérico (que "acepta mudo" `create_type` sin respetarlo en el DDL, ver
el mismo detalle ya documentado en `lotes/models.py` para `Lote.category`).
"""

import enum
import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, Enum, ForeignKey, Index, Numeric, String, Text
from sqlalchemy.dialects.postgresql import ENUM as PGEnum
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base_class import Base
from app.db.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class PostAuctionStatus(str, enum.Enum):
    """Flujo lineal del Módulo 7.5 -- ver `state_machine.py` para las transiciones
    permitidas (hacia adelante únicamente, con saltos permitidos)."""

    ADJUDICADO = "adjudicado"
    PENDIENTE_CONTACTO = "pendiente_contacto"
    PAGO_PENDIENTE = "pago_pendiente"
    PAGO_RECIBIDO = "pago_recibido"
    PREPARANDO_ENTREGA = "preparando_entrega"
    ENVIADO = "enviado"
    ENTREGADO = "entregado"
    FINALIZADO = "finalizado"


def _enum_values(enum_cls: type[enum.Enum]) -> list[str]:
    """Fuerza a SQLAlchemy a persistir el `.value` del enum, no el nombre del miembro --
    mismo detalle duplicado en cada módulo del proyecto (`remates/models.py`,
    `lotes/models.py`, `users/models.py`)."""
    return [member.value for member in enum_cls]


class PostAuctionCase(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "postauction_cases"
    __table_args__ = (
        Index("uq_postauction_cases_lote_id", "lote_id", unique=True),
        Index("ix_postauction_cases_rematador_id_status", "rematador_id", "status"),
    )

    lote_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("lotes.id", ondelete="RESTRICT"), nullable=False
    )
    remate_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("remates.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    buyer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    # Denormalizado desde `Remate.owner_id` al crear el caso -- evita un join a
    # `remates` en cada listado de "ventas adjudicadas" del rematador (índice compuesto
    # con `status` arriba, que es el filtro más frecuente de esa pantalla).
    rematador_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )

    final_price: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)

    status: Mapped[PostAuctionStatus] = mapped_column(
        Enum(
            PostAuctionStatus,
            name="postauction_status",
            native_enum=True,
            values_callable=_enum_values,
        ),
        nullable=False,
        default=PostAuctionStatus.ADJUDICADO,
    )

    # Fechas hito -- completadas por `PostAuctionService.change_status` al alcanzar el
    # estado correspondiente (ver `STATUS_MILESTONE_FIELD` en `state_machine.py`), nunca
    # editables por separado.
    contacted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    payment_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    shipped_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finalized_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Última observación libre del rematador -- el historial completo de observaciones
    # vive en `PostAuctionTimelineEntry` (acción `note_added`); este campo es solo el
    # valor "actual" para mostrar sin tener que recorrer el timeline.
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    def __repr__(self) -> str:
        return f"<PostAuctionCase id={self.id} lote_id={self.lote_id} status={self.status.value}>"


class PostAuctionTimelineEntry(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "postauction_timeline_entries"
    __table_args__ = (
        Index("ix_postauction_timeline_entries_case_id_occurred_at", "case_id", "occurred_at"),
    )

    case_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("postauction_cases.id", ondelete="CASCADE"),
        nullable=False,
    )

    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )

    # Denormalizado al momento del registro -- mismo criterio que `AuditLogEntry`
    # (sobrevive a que el usuario cambie de nombre/rol). `None` para transiciones
    # disparadas por el sistema (creación automática del caso al adjudicarse el lote).
    actor_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    actor_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    actor_role: Mapped[str | None] = mapped_column(String(20), nullable=True)

    # "case_created" | "status_changed" | "note_added" -- string abierto, mismo criterio
    # que `AuditLogEntry.action` (ver `app/audit/actions.py`).
    action: Mapped[str] = mapped_column(String(50), nullable=False)

    previous_status: Mapped[PostAuctionStatus | None] = mapped_column(
        PGEnum(
            PostAuctionStatus,
            name="postauction_status",
            values_callable=_enum_values,
            create_type=False,
        ),
        nullable=True,
    )
    new_status: Mapped[PostAuctionStatus | None] = mapped_column(
        PGEnum(
            PostAuctionStatus,
            name="postauction_status",
            values_callable=_enum_values,
            create_type=False,
        ),
        nullable=True,
    )
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    details: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    def __repr__(self) -> str:
        return (
            f"<PostAuctionTimelineEntry id={self.id} case_id={self.case_id} "
            f"action={self.action!r}>"
        )
