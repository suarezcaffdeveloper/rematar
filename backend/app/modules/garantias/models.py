"""Modelos de la Garantía Económica (bloqueo de tarjeta vía Mercado Pago) -- ver el plan
"Garantía económica (bloqueo de tarjeta) para ofertar en un remate" y, cuando exista,
`docs/adr/ADR-0XX-garantia-economica-preautorizacion.md`.

`Garantia` es un registro de negocio vivo (mismo criterio que `PostAuctionCase`): FKs con
`ondelete="RESTRICT"` hacia `remates`/`users`, nunca queda huérfana. A lo sumo una
garantía por (remate, comprador) -- `UniqueConstraint` abajo; un reintento tras `FAILED`
actualiza la misma fila en vez de crear otra (ver `GarantiaService.create_or_retry`).

`amount`/`currency` se copian de `RemateSettings` al crear el hold, no son una referencia
viva -- si la empresa cambia `guarantee_amount` después, los holds ya creados no se
recalculan (limitación conocida documentada en el plan).

`GarantiaEvent` es insert-only, mismo criterio estructural que `PostAuctionTimelineEntry`:
hijo de una `Garantia` sin valor propio fuera de ella, `ondelete="CASCADE"` sobre
`garantia_id`. Guarda el payload crudo de cada webhook de Mercado Pago para
soporte/disputas, sin tener que reconstruirlo a partir del estado actual.
"""

import enum
import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Numeric,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base_class import Base
from app.db.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class GarantiaStatus(str, enum.Enum):
    """Ver el plan para el diagrama de transiciones -- en resumen:
    PENDING_AUTHORIZATION -> ACTIVE -> (CAPTURED | RELEASED | EXPIRED); o
    PENDING_AUTHORIZATION -> FAILED (reintentable, misma fila)."""

    PENDING_AUTHORIZATION = "pending_authorization"
    ACTIVE = "active"
    CAPTURED = "captured"
    RELEASED = "released"
    EXPIRED = "expired"
    FAILED = "failed"


def _enum_values(enum_cls: type[enum.Enum]) -> list[str]:
    """Fuerza a SQLAlchemy a persistir el `.value` del enum, no el nombre del miembro --
    mismo detalle duplicado en cada módulo del proyecto (`remates/models.py`,
    `postauction/models.py`, `users/models.py`)."""
    return [member.value for member in enum_cls]


class Garantia(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "garantias"
    __table_args__ = (
        UniqueConstraint("remate_id", "buyer_id", name="uq_garantias_remate_id_buyer_id"),
        # Consultado por `GarantiaEventDispatcher` al cerrar un remate (liberar/capturar
        # todas las garantías ACTIVE de ese remate) -- índice parcial porque es el único
        # estado que ese job busca, y es transitorio (la mayoría de las filas terminan en
        # CAPTURED/RELEASED/EXPIRED).
        Index(
            "ix_garantias_remate_id_active",
            "remate_id",
            postgresql_where=text("status = 'active'"),
        ),
        # Consultado por `GarantiaExpiryScheduler` para encontrar holds por vencer.
        Index(
            "ix_garantias_expires_at_active",
            "expires_at",
            postgresql_where=text("status = 'active'"),
        ),
    )

    remate_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("remates.id", ondelete="RESTRICT"), nullable=False
    )
    buyer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )

    status: Mapped[GarantiaStatus] = mapped_column(
        Enum(
            GarantiaStatus,
            name="garantia_status",
            native_enum=True,
            values_callable=_enum_values,
        ),
        nullable=False,
        default=GarantiaStatus.PENDING_AUTHORIZATION,
    )

    # Copiados de `RemateSettings` al crear el hold -- ver docstring del módulo.
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)

    # Identificadores/estado crudo de Mercado Pago -- nunca expuestos tal cual al
    # frontend (`GarantiaRead` solo expone `status`/`amount`/`currency`/`expires_at`).
    mp_payment_id: Mapped[str | None] = mapped_column(String(50), nullable=True)
    mp_status: Mapped[str | None] = mapped_column(String(30), nullable=True)

    authorized_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # `authorized_at` + `Settings.MERCADOPAGO_HOLD_VALIDITY_DAYS` en el momento de
    # autorizar -- usado por `GarantiaExpiryScheduler`, ver política de expiración.
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    captured_amount: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    captured_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    released_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # "no_ganador" | "cancelado_por_empresa" | "expirado" | "remate_cancelado" -- string
    # abierto, mismo criterio que `PostAuctionTimelineEntry.action`.
    release_reason: Mapped[str | None] = mapped_column(String(255), nullable=True)

    failure_reason: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # `None` hasta que `GarantiaExpiryScheduler` manda el aviso de "por vencer, volvé a
    # autorizar" -- mismo criterio que `Notification.read_at` (un único campo es tanto la
    # marca de estado como el timestamp): evita mandarlo de nuevo en cada tick mientras
    # la garantía sigue ACTIVE dentro de la ventana de aviso.
    expiry_warning_sent_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    def __repr__(self) -> str:
        return (
            f"<Garantia id={self.id} remate_id={self.remate_id} buyer_id={self.buyer_id} "
            f"status={self.status.value}>"
        )


class GarantiaEvent(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "garantia_events"
    __table_args__ = (
        Index("ix_garantia_events_garantia_id_occurred_at", "garantia_id", "occurred_at"),
    )

    garantia_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("garantias.id", ondelete="CASCADE"),
        nullable=False,
    )
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, index=True
    )
    # "created" | "authorized" | "capture_requested" | "captured" | "release_requested" |
    # "released" | "expired" | "webhook_received" -- string abierto, mismo criterio que
    # `PostAuctionTimelineEntry.action`.
    event_type: Mapped[str] = mapped_column(String(50), nullable=False)
    # Payload crudo relevante (ej. el body del webhook de Mercado Pago) -- para
    # soporte/disputas sin depender de logs.
    details: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    def __repr__(self) -> str:
        return (
            f"<GarantiaEvent id={self.id} garantia_id={self.garantia_id} "
            f"event_type={self.event_type!r}>"
        )
