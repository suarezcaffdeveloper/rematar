"""Endpoints HTTP del Audit Service (Épica 7, Módulo 7.2). Ver
docs/36-sistema-de-auditoria-y-trazabilidad.md y ADR-039.

No vive dentro de `app/modules/remates/` -- mismo criterio que `app/analytics/router.py`:
un módulo top-level propio, montado directamente en `app/api/router.py`, con
`GET /remates/{remate_id}/audit` colgando del mismo path efectivo que tendría si viviera
ahí.

`GET /audit` (global) exige `require_roles(UserRole.ADMIN)` a nivel de router --
`GET /remates/{remate_id}/audit` no lo exige a ese nivel porque también lo puede ver el
rematador dueño, no solo un admin (mismo criterio "sin RequireRole a nivel de ruta, el
service decide" que ya usa Analítica).
"""

import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.audit.dependencies import get_audit_service
from app.audit.schemas import AuditLogEntryRead, AuditLogFilters
from app.audit.service import AuditService
from app.common.schemas import Page
from app.core.config import Settings, get_settings
from app.modules.auth.dependencies import get_current_user, require_roles
from app.modules.users.models import User, UserRole

router = APIRouter()


def _filters(
    actor_id: uuid.UUID | None = None,
    action: str | None = None,
    resource_type: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    search: str | None = None,
    sort: str = Query(default="desc", pattern="^(asc|desc)$"),
) -> AuditLogFilters:
    return AuditLogFilters(
        actor_id=actor_id,
        action=action,
        resource_type=resource_type,
        date_from=date_from,
        date_to=date_to,
        search=search,
        sort=sort,
    )


@router.get(
    "/audit",
    response_model=Page[AuditLogEntryRead],
    dependencies=[Depends(require_roles(UserRole.ADMIN))],
    summary="Auditoría global de la plataforma -- solo administrador",
)
async def list_global_audit_log(
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[AuditService, Depends(get_audit_service)],
    settings: Annotated[Settings, Depends(get_settings)],
    filters: Annotated[AuditLogFilters, Depends(_filters)],
    page: int = Query(default=1, ge=1),
    page_size: int | None = Query(default=None, ge=1, le=200),
) -> Page[AuditLogEntryRead]:
    resolved_page_size = page_size or settings.AUDIT_LOG_DEFAULT_PAGE_SIZE
    items, total = await service.list_global(
        viewer=current_user, filters=filters, page=page, page_size=resolved_page_size
    )
    return Page[AuditLogEntryRead](
        items=[AuditLogEntryRead.model_validate(item) for item in items],
        total=total,
        page=page,
        page_size=resolved_page_size,
    )


@router.get(
    "/remates/{remate_id}/audit",
    response_model=Page[AuditLogEntryRead],
    summary="Auditoría de un remate -- solo dueño o administrador",
)
async def list_remate_audit_log(
    remate_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[AuditService, Depends(get_audit_service)],
    settings: Annotated[Settings, Depends(get_settings)],
    filters: Annotated[AuditLogFilters, Depends(_filters)],
    page: int = Query(default=1, ge=1),
    page_size: int | None = Query(default=None, ge=1, le=200),
) -> Page[AuditLogEntryRead]:
    resolved_page_size = page_size or settings.AUDIT_LOG_DEFAULT_PAGE_SIZE
    items, total = await service.list_for_remate(
        remate_id,
        viewer=current_user,
        filters=filters,
        page=page,
        page_size=resolved_page_size,
    )
    return Page[AuditLogEntryRead](
        items=[AuditLogEntryRead.model_validate(item) for item in items],
        total=total,
        page=page,
        page_size=resolved_page_size,
    )
