"""DTOs del Audit Service (Épica 7, Módulo 7.2). Ver
docs/36-sistema-de-auditoria-y-trazabilidad.md y ADR-039.

Reutiliza `Page[T]` de `app/common/schemas.py` para la respuesta paginada -- no hace
falta un envoltorio propio, mismo criterio que cualquier otro listado paginado del
proyecto (remates, lotes, ofertas).
"""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class AuditLogEntryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    occurred_at: datetime
    actor_id: uuid.UUID | None
    actor_name: str | None
    actor_role: str | None
    action: str
    resource_type: str
    resource_id: uuid.UUID | None
    remate_id: uuid.UUID | None
    details: dict | None


class AuditLogFilters(BaseModel):
    """Filtros compartidos por `GET /audit` y `GET /remates/{remate_id}/audit` -- se arman
    a partir de los query params del router, ver `router.py`."""

    actor_id: uuid.UUID | None = None
    action: str | None = None
    resource_type: str | None = None
    date_from: datetime | None = None
    date_to: datetime | None = None
    search: str | None = None
    sort: str = "desc"
