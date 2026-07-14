"""Mixins reutilizables para modelos ORM.

Por qué UUID y no un entero autoincremental como clave primaria: un id autoincremental
expone cuántos registros existen y en qué orden se crearon (enumerable por un cliente
externo simplemente probando ids consecutivos), y complica combinar datos de múltiples
fuentes si el sistema alguna vez se descompone en servicios separados (ver
`docs/adr/ADR-001-modular-monolito-vs-microservicios.md`: se diseña para que esa
extracción futura sea viable). El UUID se genera en Python (`default=uuid.uuid4`), no en
la base (`server_default=func.gen_random_uuid()`), para no depender de ninguna extensión
de PostgreSQL — es una simplificación deliberada, no una limitación técnica.
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column


class UUIDPrimaryKeyMixin:
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class SoftDeleteMixin:
    """Borrado lógico: `deleted_at` nulo significa "vivo".

    Se agregó para `Remate` (Épica 2, Módulo 2.1): un remate programado o en curso tiene
    valor de auditoría (compradores pudieron haberlo seguido, haber ofertado) que un
    `DELETE` físico destruiría sin dejar rastro. `Remate.soft_delete()` solo se permite
    en estado `DRAFT` (ver `app/modules/remates/service.py`) — para cualquier estado
    posterior, la vía correcta es cancelar (que sí conserva motivo y timestamp), no
    borrar. Se deja como mixin en `db/`, no en el módulo de remates, porque cualquier
    entidad de negocio futura con la misma necesidad (Lotes, por ejemplo) lo reutiliza
    sin duplicar la columna ni la propiedad.
    """

    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, default=None
    )

    @property
    def is_deleted(self) -> bool:
        return self.deleted_at is not None
