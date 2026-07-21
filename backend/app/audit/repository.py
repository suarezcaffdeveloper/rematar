"""Acceso a datos del Audit Service (Épica 7, Módulo 7.2). Ver
docs/36-sistema-de-auditoria-y-trazabilidad.md y ADR-039.

Superficie de **escritura**: sin ningún import de `app.modules.*`, solo conoce
`AuditLogEntry` y primitivas (`uuid`, `str`, `dict`). Es lo que se inyecta directo en los
servicios de dominio (`AuthService`, `RemateService`, `LoteService`, `AuctionEngine`,
`ChatService`) -- mismo criterio que `RemateService` recibe `LoteRepository`, no
`LoteService`, para evitar un import circular (ADR-019): si esos servicios dependieran
de `AuditService` (que sí importa `RemateService`, ver `service.py`), se cerraría un
ciclo. `test_architecture_boundaries.py` verifica que ningún módulo de dominio importe
`app.audit.service`/`app.audit.router`, solo esta superficie.

`record()` es síncrono y **no comitea** -- se llama justo antes del `commit()` que cada
servicio de dominio ya ejecuta para su propia acción, de forma que la entrada de
auditoría quede en la misma transacción (ADR-039 sección A): si esa transacción se
revierte, no queda entrada (correcto, la acción no ocurrió); si se confirma, la entrada
se confirma con ella.
"""

import uuid
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit.models import AuditLogEntry


class AuditLogRepository:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    def record(
        self,
        *,
        actor_id: uuid.UUID | None,
        actor_name: str | None,
        actor_role: str | None,
        action: str,
        resource_type: str,
        resource_id: uuid.UUID | None = None,
        remate_id: uuid.UUID | None = None,
        details: dict | None = None,
    ) -> None:
        self._db.add(
            AuditLogEntry(
                actor_id=actor_id,
                actor_name=actor_name,
                actor_role=actor_role,
                action=action,
                resource_type=resource_type,
                resource_id=resource_id,
                remate_id=remate_id,
                details=details,
            )
        )

    async def flush(self) -> None:
        """Asigna los ids client-side (`default=uuid.uuid4`, ver `db/mixins.py`) de
        cualquier objeto pendiente en la sesión sin comitear -- lo usan `RemateService.
        create`/`LoteService.create`/`AuctionEngine._save` para conocer el id del recurso
        recién construido (necesario como `resource_id`) antes del único `commit()` que
        cierra la transacción."""
        await self._db.flush()

    async def commit(self) -> None:
        await self._db.commit()

    async def list_paginated(
        self,
        *,
        offset: int,
        limit: int,
        actor_id: uuid.UUID | None = None,
        action: str | None = None,
        resource_type: str | None = None,
        remate_id: uuid.UUID | None = None,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
        search: str | None = None,
        sort: str = "desc",
    ) -> tuple[list[AuditLogEntry], int]:
        stmt = select(AuditLogEntry)
        conditions = []
        if actor_id is not None:
            conditions.append(AuditLogEntry.actor_id == actor_id)
        if action is not None:
            conditions.append(AuditLogEntry.action == action)
        if resource_type is not None:
            conditions.append(AuditLogEntry.resource_type == resource_type)
        if remate_id is not None:
            conditions.append(AuditLogEntry.remate_id == remate_id)
        if date_from is not None:
            conditions.append(AuditLogEntry.occurred_at >= date_from)
        if date_to is not None:
            conditions.append(AuditLogEntry.occurred_at <= date_to)
        if search:
            conditions.append(AuditLogEntry.actor_name.ilike(f"%{search}%"))
        if conditions:
            stmt = stmt.where(*conditions)

        count_stmt = select(func.count()).select_from(stmt.subquery())
        total = (await self._db.execute(count_stmt)).scalar_one()

        order = AuditLogEntry.occurred_at.asc() if sort == "asc" else AuditLogEntry.occurred_at.desc()
        id_order = AuditLogEntry.id.asc() if sort == "asc" else AuditLogEntry.id.desc()
        stmt = stmt.order_by(order, id_order).offset(offset).limit(limit)
        items = (await self._db.execute(stmt)).scalars().all()
        return list(items), total
