"""Modelo de Lote (Épica 2, Módulos 2.2 y 2.3).

Ver docs/15-modulo-lote.md para la justificación completa de los campos estructurales
(Módulo 2.2): un `Lote` pertenece a exactamente un `Remate` (`remate_id`, FK simple sin
`relationship()` de SQLAlchemy — mismo patrón que `Remate.owner_id` hacia `User`, ver el
docstring de `remates/models.py`). Ver docs/16-motor-de-estados.md para los campos de
auditoría de transiciones (`opened_at`, `closed_at`, `final_price`,
`cancellation_reason`, `cancelled_at`, Módulo 2.3): `LoteService.open`/`open_next`/
`close`/`cancel` son quienes los completan.

`LoteStatus` reutiliza los cinco estados ya definidos en docs/07-maquinas-de-estado.md
(Fase 0) sin agregar un `PAUSED` propio de lote — la pausa es un concepto de `Remate` que
ya alcanza a cualquier lote `OPEN` en curso (ver docs/15-modulo-lote.md). `category`
reutiliza `RemateCategory` en vez de una taxonomía propia (ADR-014).

Los tres campos `timer_*` (Épica 8, "cuenta regresiva y cierre automático", ADR-007/
ADR-043) tampoco agregan un estado propio de `LoteStatus`: la pausa del *timer* (distinta
de la pausa del remate) se representa con estas columnas, no con una transición nueva.
Ver docs/40-cuenta-regresiva-y-cierre-automatico.md.
"""

import enum
import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import ENUM as PGEnum
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base_class import Base
from app.db.mixins import SoftDeleteMixin, TimestampMixin, UUIDPrimaryKeyMixin
from app.modules.remates.models import RemateCategory


class LoteStatus(str, enum.Enum):
    """Ver docs/07-maquinas-de-estado.md y docs/16-motor-de-estados.md. Todo lote se crea
    en PENDING; las transiciones las aplica `LoteService` (Módulo 2.3)."""

    PENDING = "pending"
    OPEN = "open"
    CLOSED_SOLD = "closed_sold"
    CLOSED_UNSOLD = "closed_unsold"
    CANCELLED = "cancelled"


def _enum_values(enum_cls: type[enum.Enum]) -> list[str]:
    """Fuerza a SQLAlchemy a persistir el `.value` del enum, no el nombre del miembro —
    mismo detalle que en `remates/models.py` y `users/models.py`. Se duplica acá (en vez
    de importarla) porque es un símbolo privado de `remates/models.py`; dos líneas
    idénticas son preferibles a exponer un helper interno entre archivos."""
    return [member.value for member in enum_cls]


class Lote(UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "lotes"
    __table_args__ = (
        CheckConstraint("base_price > 0", name="base_price_positive"),
        CheckConstraint("min_increment > 0", name="min_increment_positive"),
        CheckConstraint("quantity >= 1", name="quantity_at_least_one"),
        CheckConstraint(
            "reserve_price IS NULL OR reserve_price >= base_price",
            name="reserve_price_gte_base_price",
        ),
        CheckConstraint("final_price IS NULL OR final_price > 0", name="final_price_positive"),
        # Único por remate entre lotes vivos (ADR-015): dos rematadores distintos, o el
        # mismo rematador en otro remate, pueden reutilizar el mismo número de catálogo.
        Index(
            "uq_lotes_remate_id_lot_number",
            "remate_id",
            "lot_number",
            unique=True,
            postgresql_where=text("deleted_at IS NULL"),
        ),
        # Invariante RF-12 (ADR-017): a lo sumo un lote OPEN por remate — garantizada por
        # la base como respaldo de la validación de aplicación en LoteService.open.
        Index(
            "uq_lotes_remate_id_open_status",
            "remate_id",
            unique=True,
            postgresql_where=text("status = 'open' AND deleted_at IS NULL"),
        ),
        Index("ix_lotes_remate_id_display_order", "remate_id", "display_order"),
        # Usado por `TimerExpiryScheduler` (app/timer/scheduler.py) para encontrar
        # lotes con timer vencido sin escanear los que no tienen uno corriendo.
        Index(
            "ix_lotes_open_timer_ends_at",
            "timer_ends_at",
            postgresql_where=text("status = 'open' AND timer_ends_at IS NOT NULL"),
        ),
    )

    # RESTRICT, no CASCADE: mismo razonamiento que Remate.owner_id -> users. Un lote es
    # registro de negocio con valor de auditoría propio.
    remate_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("remates.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    lot_number: Mapped[str] = mapped_column(String(20), nullable=False)
    # Posición de exhibición dentro del remate. Asignada por el sistema al crear, y
    # modificada únicamente vía LoteService.reorder (ver ADR-015) — nunca por PATCH.
    display_order: Mapped[int] = mapped_column(Integer, nullable=False)

    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    category: Mapped[RemateCategory] = mapped_column(
        # postgresql.ENUM (no el genérico sqlalchemy.Enum): `create_type` solo existe
        # como parámetro real en la variante de Postgres — el genérico lo acepta mudo
        # (se ignora en silencio, sin error) pero no lo respeta al emitir DDL. El tipo
        # `remate_category` ya lo crea la migración de `remates` (ADR-014 reutiliza el
        # mismo enum nativo); `create_type=False` evita que Alembic intente un
        # `CREATE TYPE` duplicado al generar/correr la migración de esta tabla.
        PGEnum(
            RemateCategory,
            name="remate_category",
            values_callable=_enum_values,
            create_type=False,
        ),
        nullable=False,
    )

    # Atributos libres específicos del tipo de lote (raza/peso, VIN/año, m2, etc.) — ver
    # ADR-014. Validación de forma (cantidad de claves, longitud) en lotes/schemas.py.
    attributes: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    # Listas de `{url, order, caption}` / `{url, title, document_type}` — ver
    # docs/15-modulo-lote.md. Sin almacenamiento propio de archivos, mismo alcance que
    # Remate.cover_image_url.
    images: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    documents: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)

    # Varias unidades idénticas vendidas como un solo lote (ej. "10 cabezas"). Ver
    # docs/15-modulo-lote.md, "Campos propuestos".
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    unit_label: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # Numeric/Decimal, no Float: son montos de dinero (primer campo monetario del
    # proyecto). Moneda implícita: Remate.settings.currency (ver docs/15-modulo-lote.md).
    base_price: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    min_increment: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    # Oculto a compradores en la lectura (ADR-016) — se persiste siempre, se nulea en el
    # objeto devuelto por LoteService según quién lo consulta.
    reserve_price: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)

    status: Mapped[LoteStatus] = mapped_column(
        Enum(
            LoteStatus,
            name="lote_status",
            native_enum=True,
            values_callable=_enum_values,
        ),
        nullable=False,
        default=LoteStatus.PENDING,
    )

    # Auditoría de las transiciones del motor de estados (Épica 2, Módulo 2.3). Todas
    # nulleables y completadas exclusivamente por LoteService.open/open_next/close/cancel
    # — nunca por el CRUD estructural del Módulo 2.2. `final_price` se declara
    # manualmente por el rematador en esta fase (ver ADR-018); no hay ganador ni
    # comprador asociado, solo un monto.
    opened_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    final_price: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    cancellation_reason: Mapped[str | None] = mapped_column(String(500), nullable=True)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Cuenta regresiva y cierre automático (Épica 8, ADR-007/ADR-043) -- estado del
    # timer vive en Postgres, nunca en memoria de una instancia (ADR-007), para que
    # cualquier réplica del backend pueda evaluarlo igual. `TimerService`
    # (`app/timer/`) es el único que las escribe. Nunca ambas no-nulas a la vez:
    # `timer_ends_at` mientras corre (deadline absoluto), `timer_paused_remaining_seconds`
    # mientras está pausado (segundos congelados); ambas `None` si el lote nunca tuvo
    # timer (el remate no configuró `settings.lote_timer_seconds`).
    timer_ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    timer_paused_remaining_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    timer_auto_close_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    def __repr__(self) -> str:
        return (
            f"<Lote id={self.id} remate_id={self.remate_id} "
            f"lot_number={self.lot_number!r} status={self.status.value}>"
        )
