"""Modelo de Oferta (Épica 2.4 — Auction Engine).

Ver docs/17-auction-engine.md para la justificación completa de cada campo y
docs/adr/ADR-020-diseno-del-auction-engine.md para el diseño completo del motor.

`Oferta` es su propio módulo top-level (`app/modules/ofertas/`), no un sub-paquete de
`remates` — a diferencia de `Lote`, que comparte bounded context con `Remate`,
docs/09-arquitectura-y-decisiones.md ya distinguía "Bidding" como módulo propio desde
Fase 0. `lote_id` y `buyer_id` son FKs simples sin `relationship()` de SQLAlchemy, mismo
criterio que `Remate.owner_id -> User`.

`OfertaStatus` tiene los cuatro valores **persistidos** ya definidos en
docs/07-maquinas-de-estado.md (Fase 0): `ACCEPTED`, `REJECTED`, `OUTBID`, `WINNING`.
`LEADING` no es un valor de este enum — es una consulta derivada ("la oferta ACCEPTED de
ese lote", ver el índice único parcial en `__table_args__`). `WINNING` está modelado
pero todavía inalcanzable: nada en esta fase lo asigna (ver "Qué queda" en
docs/17-auction-engine.md).

Una `Oferta` es inmutable salvo por su `status` (que solo cambia una vez, `ACCEPTED ->
OUTBID`, o en el futuro `ACCEPTED -> WINNING`) — no tiene `SoftDeleteMixin` ni endpoint
de borrado: RF-25 exige un registro inmutable de toda oferta recibida.
"""

import enum
import uuid
from decimal import Decimal

from sqlalchemy import CheckConstraint, Enum, ForeignKey, Index, Numeric, String, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base_class import Base
from app.db.mixins import TimestampMixin, UUIDPrimaryKeyMixin


class OfertaStatus(str, enum.Enum):
    """Ver docs/07-maquinas-de-estado.md y docs/17-auction-engine.md. `LEADING` no está
    acá a propósito: es un valor derivado, no persistido (ver `__table_args__`)."""

    ACCEPTED = "accepted"
    REJECTED = "rejected"
    OUTBID = "outbid"
    WINNING = "winning"


def _enum_values(enum_cls: type[enum.Enum]) -> list[str]:
    """Fuerza a SQLAlchemy a persistir el `.value` del enum, no el nombre del miembro —
    mismo detalle duplicado en cada módulo (`remates`, `lotes`, `users`) por la misma
    razón: es un símbolo privado de cada archivo, no vale la pena compartirlo entre
    módulos por dos líneas idénticas."""
    return [member.value for member in enum_cls]


class Oferta(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "ofertas"
    __table_args__ = (
        CheckConstraint("amount > 0", name="amount_positive"),
        # Idempotencia (ADR-020, sección D): un reintento de red del mismo comprador con
        # el mismo client_token devuelve la oferta ya persistida en vez de duplicarla.
        # Único por comprador, no global, para que dos compradores distintos puedan usar
        # el mismo valor de token sin colisionar entre sí.
        Index(
            "uq_ofertas_buyer_id_client_token",
            "buyer_id",
            "client_token",
            unique=True,
            postgresql_where=text("client_token IS NOT NULL"),
        ),
        # Invariante central del motor (ADR-020, secciones B y E): a lo sumo una oferta
        # ACCEPTED por lote en todo momento — es lo que permite que "la oferta vigente"
        # sea una consulta directa por estado, sin MAX(amount).
        Index(
            "uq_ofertas_lote_id_accepted",
            "lote_id",
            unique=True,
            postgresql_where=text("status = 'accepted'"),
        ),
        # Mismo criterio para el ganador final — todavía inalcanzable en esta fase, pero
        # ya protegido (mismo patrón preventivo que ADR-017).
        Index(
            "uq_ofertas_lote_id_winning",
            "lote_id",
            unique=True,
            postgresql_where=text("status = 'winning'"),
        ),
        Index("ix_ofertas_lote_id_created_at", "lote_id", "created_at"),
    )

    # RESTRICT, no CASCADE: una oferta es registro de auditoría inmutable (RF-25), igual
    # criterio que remate_id/owner_id en los módulos anteriores.
    lote_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("lotes.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    buyer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True
    )

    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)

    status: Mapped[OfertaStatus] = mapped_column(
        Enum(
            OfertaStatus,
            name="oferta_status",
            native_enum=True,
            values_callable=_enum_values,
        ),
        nullable=False,
    )

    # Obligatorio solo cuando status = REJECTED (RF-18) — no se modela con una tabla de
    # auditoría aparte, mismo criterio que Lote.cancellation_reason/Remate.cancellation_reason.
    rejection_reason: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # Idempotencia (ver __table_args__). Generado por el cliente, no interpretado por el
    # servidor más allá de la comparación de igualdad.
    client_token: Mapped[str | None] = mapped_column(String(100), nullable=True)

    def __repr__(self) -> str:
        return (
            f"<Oferta id={self.id} lote_id={self.lote_id} amount={self.amount} "
            f"status={self.status.value}>"
        )
