"""DTOs del Monitoring Service (Épica 8, Módulo 8.1). Ver
docs/38-observabilidad-y-monitoreo.md y ADR-041.
"""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel

HealthStatus = Literal["ok", "degraded", "unavailable"]


class HealthCheckResult(BaseModel):
    component: Literal["api", "postgres", "redis", "websocket"]
    status: HealthStatus
    detail: str | None = None


class HealthCheckResponse(BaseModel):
    """`status` general: `"ok"` únicamente si los cuatro componentes están `"ok"` --
    cualquier componente degradado/caído baja el estado general, aunque la API en sí
    (este mismo endpoint respondiendo) siga funcionando."""

    status: HealthStatus
    checks: list[HealthCheckResult]
    generated_at: datetime


class PlatformMetrics(BaseModel):
    connected_users: int
    active_websockets: int
    chat_messages_per_minute: int
    ofertas_per_minute: int
    avg_oferta_processing_ms: float | None
    avg_api_response_ms: float | None
    errors_last_minute: int
    memory_usage_mb: float | None
    cpu_usage_percent: float | None
    generated_at: datetime
