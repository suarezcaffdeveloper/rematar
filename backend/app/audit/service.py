"""`AuditService` (Épica 7, Módulo 7.2). Ver
docs/36-sistema-de-auditoria-y-trazabilidad.md y ADR-039.

Superficie de **lectura**, exclusiva del panel de auditoría (admin global, rematador
scoped a sus propios remates) -- nunca se inyecta en un servicio de dominio (ver
docstring de `repository.py` para el porqué). Compone `RemateService` para resolver
visibilidad/propiedad, mismo patrón que `AnalyticsService.build`
(`app/analytics/service.py`).
"""

import uuid

from app.audit.models import AuditLogEntry
from app.audit.repository import AuditLogRepository
from app.audit.schemas import AuditLogFilters
from app.core.exceptions import ForbiddenError
from app.modules.remates.service import RemateService
from app.modules.users.models import User, UserRole


class AuditService:
    def __init__(self, repository: AuditLogRepository, remate_service: RemateService) -> None:
        self._repository = repository
        self._remate_service = remate_service

    async def list_global(
        self, *, viewer: User, filters: AuditLogFilters, page: int, page_size: int
    ) -> tuple[list[AuditLogEntry], int]:
        """Solo administradores -- el router ya lo exige vía `require_roles`, este
        chequeo es defensa en profundidad (mismo criterio que el resto del proyecto no
        confía únicamente en la capa de transporte)."""
        if viewer.role != UserRole.ADMIN:
            raise ForbiddenError("Solo un administrador puede ver la auditoría global.")

        offset = (page - 1) * page_size
        return await self._repository.list_paginated(
            offset=offset,
            limit=page_size,
            actor_id=filters.actor_id,
            action=filters.action,
            resource_type=filters.resource_type,
            date_from=filters.date_from,
            date_to=filters.date_to,
            search=filters.search,
            sort=filters.sort,
        )

    async def list_for_remate(
        self,
        remate_id: uuid.UUID,
        *,
        viewer: User,
        filters: AuditLogFilters,
        page: int,
        page_size: int,
    ) -> tuple[list[AuditLogEntry], int]:
        """Dueño del remate o administrador -- mismo criterio 404-oculta-borradores +
        403-si-no-es-dueño-ni-admin que `AnalyticsService.build`."""
        remate = await self._remate_service.get_visible_or_raise(remate_id, viewer)
        if viewer.role != UserRole.ADMIN and remate.owner_id != viewer.id:
            raise ForbiddenError(
                "Solo el rematador dueño del remate (o un administrador) puede ver su "
                "auditoría."
            )

        offset = (page - 1) * page_size
        return await self._repository.list_paginated(
            offset=offset,
            limit=page_size,
            actor_id=filters.actor_id,
            action=filters.action,
            resource_type=filters.resource_type,
            remate_id=remate_id,
            date_from=filters.date_from,
            date_to=filters.date_to,
            search=filters.search,
            sort=filters.sort,
        )
