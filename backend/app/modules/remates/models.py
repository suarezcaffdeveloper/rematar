"""Modelo de Remate (Épica 2, Módulo 2.1).

Deliberadamente sin relación con Lotes/Ofertas todavía: el remate existe como entidad
completa aunque no tenga lotes cargados. Tampoco hay una relación SQLAlchemy
(`relationship`) hacia `User` — `owner_id` es una FK simple. Un módulo puede referenciar
la fila de otro por id sin acoplarse a su grafo de objetos ORM; eso es justamente lo que
mantiene los límites de módulo de ADR-001 (Fase 0) reales en el código, no solo en un
diagrama. Si una fase futura necesita traer datos del dueño junto con el remate (para no
pagar una consulta aparte), esa es una decisión de rendimiento a tomar en ese momento,
no algo que valga la pena pagar en acoplamiento hoy sin un caso de uso concreto.

`RemateCategory` y `RemateStatus` son ENUMs nativos de PostgreSQL, siguiendo el mismo
patrón que `UserRole` (ver ADR-010 de Fase 1). Detalle y trade-offs de cada uno en
ADR-012 (configuración como JSONB) y ADR-013 (categoría como enum) de esta fase.
"""

import enum
import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, Enum, ForeignKey, Index, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base_class import Base
from app.db.mixins import SoftDeleteMixin, TimestampMixin, UUIDPrimaryKeyMixin


class RemateStatus(str, enum.Enum):
    """Ver docs/07-maquinas-de-estado.md. Esta fase solo implementa las transiciones
    DRAFT -> SCHEDULED y (cualquiera no terminal) -> CANCELLED — ver
    app/modules/remates/state_machine.py para el porqué de LIVE/PAUSED/FINISHED
    quedar sin transición expuesta todavía."""

    DRAFT = "draft"
    SCHEDULED = "scheduled"
    LIVE = "live"
    PAUSED = "paused"
    FINISHED = "finished"
    CANCELLED = "cancelled"


class RemateCategory(str, enum.Enum):
    """Conjunto inicial de categorías (ver ADR-013). `OTROS` es el catch-all deliberado
    para no forzar una clasificación forzada cuando ninguna categoría encaja bien."""

    INMUEBLES = "inmuebles"
    VEHICULOS = "vehiculos"
    MAQUINARIA_AGRICOLA = "maquinaria_agricola"
    HACIENDA = "hacienda"
    ARTE_Y_ANTIGUEDADES = "arte_y_antiguedades"
    ELECTRONICA = "electronica"
    MOBILIARIO = "mobiliario"
    INDUMENTARIA = "indumentaria"
    OTROS = "otros"


# Valor por defecto de `Remate.settings` (ver ADR-012). Vive acá, no en schemas.py, para
# que el modelo ORM tenga un default coherente incluso si algo lo instancia sin pasar
# por RemateCreate (ej. un script, una migración de datos).
DEFAULT_REMATE_SETTINGS: dict = {
    "anti_sniping_enabled": False,
    "anti_sniping_extension_seconds": 60,
    "currency": "ARS",
    # Segundos de cuenta regresiva por lote al abrirlo -- `None` es "sin timer" (opt-in,
    # Épica 8, Módulo "cuenta regresiva y cierre automático"). Ver ADR-007/ADR-043.
    "lote_timer_seconds": None,
}


def _enum_values(enum_cls: type[enum.Enum]) -> list[str]:
    """Fuerza a SQLAlchemy a persistir el `.value` del enum (ej. "rematador"), no el
    nombre del miembro (ej. "REMATADOR") — mismo detalle que en `users/models.py`."""
    return [member.value for member in enum_cls]


class Remate(UUIDPrimaryKeyMixin, TimestampMixin, SoftDeleteMixin, Base):
    __tablename__ = "remates"
    __table_args__ = (
        # Nombre sin el prefijo "ck_remates_": la naming_convention de Base (ver
        # app/db/base_class.py) ya lo agrega — pasarlo acá también lo duplicaba
        # (se detectó en el SQL generado por el primer autogenerate de esta migración).
        CheckConstraint(
            "ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at",
            name="ends_at_after_starts_at",
        ),
        Index("ix_remates_status_starts_at", "status", "starts_at"),
    )

    # RESTRICT, no CASCADE: a diferencia de una sesión (refresh_tokens, que sí cascadea
    # en Fase 1), un remate es un registro de negocio con valor de auditoría propio. No
    # existe hoy ningún endpoint que borre un usuario, pero si alguna vez existiera, no
    # debería poder llevarse puestos los remates que ese usuario haya creado.
    owner_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    # Operador en vivo asignado por la empresa dueña (ver ADR-048). A diferencia de
    # `owner_id`, es SET NULL: si el usuario rematador desaparece, el remate no debería
    # quedar bloqueado -- la empresa simplemente vuelve a generar un código y asigna a
    # otro. Un rematador nunca puede ser `owner_id` (eso ahora es exclusivo de `empresa`).
    rematador_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    # Nunca se persiste el código en texto plano (mismo criterio que una contraseña,
    # aunque acá alcanza con un hash rápido -- no es un secreto de alto valor sujeto a
    # ataques de fuerza bruta offline, es un código corto que la empresa comparte una
    # vez con el rematador). Regenerar el código sobreescribe este hash y limpia
    # `rematador_id` en la misma operación (ver `RemateService.generate_operator_code`).
    operator_code_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    operator_code_generated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    category: Mapped[RemateCategory] = mapped_column(
        Enum(
            RemateCategory,
            name="remate_category",
            native_enum=True,
            values_callable=_enum_values,
        ),
        nullable=False,
    )
    cover_image_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    location: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Opcionales en DRAFT; `starts_at` pasa a ser obligatorio recién para programar (ver
    # RemateService.schedule). `ends_at` es siempre opcional (pedido explícito).
    starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    status: Mapped[RemateStatus] = mapped_column(
        Enum(
            RemateStatus,
            name="remate_status",
            native_enum=True,
            values_callable=_enum_values,
        ),
        nullable=False,
        default=RemateStatus.DRAFT,
    )

    settings: Mapped[dict] = mapped_column(
        JSONB, nullable=False, default=lambda: dict(DEFAULT_REMATE_SETTINGS)
    )

    # Auditoría de la transición a CANCELLED. `cancellation_reason` existe porque RF-11
    # (Fase 0) exige motivo obligatorio al cancelar; se guarda en la propia fila en vez
    # de una tabla de auditoría aparte porque un remate tiene, a lo sumo, una cancelación
    # en su vida — no hace falta un historial de múltiples cancelaciones.
    cancellation_reason: Mapped[str | None] = mapped_column(String(500), nullable=True)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Se completa recién cuando exista la transición a FINISHED (depende de Lotes, ver
    # state_machine.py); la columna ya existe para no requerir otra migración ese día.
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    def __repr__(self) -> str:
        return f"<Remate id={self.id} title={self.title!r} status={self.status.value}>"
