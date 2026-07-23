"""Endpoints HTTP del Monitoring Service (Épica 8, Módulo 8.1). Ver
docs/38-observabilidad-y-monitoreo.md y ADR-041.

`GET /monitoring/health` es **público** (sin auth): las herramientas de
infraestructura (load balancer, probes de orquestación, uptime monitors) no tienen
credenciales de la aplicación -- mismo criterio que `GET /health` (`app/main.py`), que
tampoco las exige. `GET /monitoring/metrics` es admin-only: expone throughput y
conteos operativos, información sensible del negocio (mismo patrón `require_roles` que
`GET /audit`, `app/audit/router.py`).
"""

from typing import Annotated

from fastapi import APIRouter, Depends

from app.modules.auth.dependencies import require_roles
from app.modules.users.models import UserRole
from app.monitoring.dependencies import get_monitoring_service
from app.monitoring.schemas import HealthCheckResponse, PlatformMetrics
from app.monitoring.service import MonitoringService

router = APIRouter()


@router.get(
    "/monitoring/health",
    response_model=HealthCheckResponse,
    summary="Estado de la API, PostgreSQL, Redis y el Gateway WebSocket -- público",
)
async def get_platform_health(
    service: Annotated[MonitoringService, Depends(get_monitoring_service)],
) -> HealthCheckResponse:
    return await service.check_health()


@router.get(
    "/monitoring/metrics",
    response_model=PlatformMetrics,
    dependencies=[Depends(require_roles(UserRole.ADMIN))],
    summary="Métricas operativas de la plataforma -- solo administrador",
)
async def get_platform_metrics(
    service: Annotated[MonitoringService, Depends(get_monitoring_service)],
) -> PlatformMetrics:
    return await service.get_metrics()
