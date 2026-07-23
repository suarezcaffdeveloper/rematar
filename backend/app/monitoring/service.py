"""`MonitoringService` (Épica 8, Módulo 8.1). Ver
docs/38-observabilidad-y-monitoreo.md y ADR-041.

Compone infraestructura ya existente sin modificarla: `ConnectionManager`
(`app/websocket/manager.py`, conteo de conexiones/usuarios), `MonitoringRepository`
(consultas globales nuevas), `RedisMetricsRecorder` (`app/redis/metrics.py`, timings
instrumentados de forma additiva) y `psutil` (proceso actual, no el host).
"""

import time
from datetime import UTC, datetime, timedelta

import psutil
import structlog
from redis.asyncio import Redis
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.monitoring.repository import MonitoringRepository
from app.monitoring.schemas import (
    HealthCheckResponse,
    HealthCheckResult,
    HealthStatus,
    PlatformMetrics,
)
from app.redis.metrics import RedisMetricsRecorder
from app.websocket.manager import ConnectionManager

logger = structlog.get_logger(__name__)

# `psutil.Process.cpu_percent(interval=None)` mide el uso desde la última llamada a ese
# mismo método sobre esa misma instancia -- necesita un objeto persistente por proceso
# (no uno nuevo por request, que siempre devolvería 0.0 al no tener muestra anterior).
# Creado una única vez al importar este módulo (una vez por proceso de backend); la
# primera llamada real "prime" la ventana, descartada acá a propósito.
_PROCESS = psutil.Process()
_PROCESS.cpu_percent(interval=None)

_RATE_WINDOW_SECONDS = 60


class MonitoringService:
    def __init__(
        self,
        repository: MonitoringRepository,
        db: AsyncSession,
        redis_client: Redis,
        connection_manager: ConnectionManager,
        metrics_recorder: RedisMetricsRecorder,
    ) -> None:
        self._repository = repository
        self._db = db
        self._redis_client = redis_client
        self._connection_manager = connection_manager
        self._metrics_recorder = metrics_recorder

    # --- Health checks -------------------------------------------------------------------

    async def check_health(self) -> HealthCheckResponse:
        checks = [
            HealthCheckResult(component="api", status="ok"),
            await self._check_postgres(),
            await self._check_redis(),
            self._check_websocket(),
        ]
        overall: HealthStatus = "ok" if all(c.status == "ok" for c in checks) else "degraded"
        return HealthCheckResponse(status=overall, checks=checks, generated_at=datetime.now(UTC))

    async def _check_postgres(self) -> HealthCheckResult:
        try:
            await self._db.execute(text("SELECT 1"))
            return HealthCheckResult(component="postgres", status="ok")
        except Exception as exc:  # noqa: BLE001 -- cualquier falla es "no disponible"
            logger.error("health_check_failed", component="postgres", error=str(exc))
            return HealthCheckResult(component="postgres", status="unavailable", detail=str(exc))

    async def _check_redis(self) -> HealthCheckResult:
        try:
            ok = bool(await self._redis_client.ping())
            if ok:
                return HealthCheckResult(component="redis", status="ok")
            return HealthCheckResult(
                component="redis", status="unavailable", detail="PING sin respuesta"
            )
        except Exception as exc:  # noqa: BLE001
            logger.error("health_check_failed", component="redis", error=str(exc))
            return HealthCheckResult(component="redis", status="unavailable", detail=str(exc))

    def _check_websocket(self) -> HealthCheckResult:
        """No hay un "ping" real de un gateway completo -- se reporta `ok` si el
        `ConnectionManager` del proceso está inicializado (siempre lo está una vez que
        el `lifespan` arrancó), con la cantidad de conexiones activas como contexto
        informativo, no como condición de fallo (cero conexiones es un estado válido,
        no una caída)."""
        active = self._connection_manager.count()
        return HealthCheckResult(
            component="websocket", status="ok", detail=f"{active} conexiones activas"
        )

    # --- Métricas --------------------------------------------------------------------------

    async def get_metrics(self) -> PlatformMetrics:
        now = time.time()
        since = datetime.now(UTC) - timedelta(seconds=_RATE_WINDOW_SECONDS)

        connections = self._connection_manager.list_connections()
        connected_users = len({c.user_id for c in connections})
        active_websockets = len(connections)

        chat_messages_per_minute = await self._repository.count_chat_messages_since(since)
        ofertas_per_minute = await self._repository.count_ofertas_since(since)

        avg_oferta_processing_ms = await self._metrics_recorder.get_average_ms(
            "oferta_processing", now=now
        )
        avg_api_response_ms = await self._metrics_recorder.get_average_ms("api_response", now=now)
        errors_last_minute = await self._metrics_recorder.get_count("errors_total", now=now)

        memory_usage_mb, cpu_usage_percent = self._process_resource_usage()

        return PlatformMetrics(
            connected_users=connected_users,
            active_websockets=active_websockets,
            chat_messages_per_minute=chat_messages_per_minute,
            ofertas_per_minute=ofertas_per_minute,
            avg_oferta_processing_ms=avg_oferta_processing_ms,
            avg_api_response_ms=avg_api_response_ms,
            errors_last_minute=errors_last_minute,
            memory_usage_mb=memory_usage_mb,
            cpu_usage_percent=cpu_usage_percent,
            generated_at=datetime.now(UTC),
        )

    @staticmethod
    def _process_resource_usage() -> tuple[float | None, float | None]:
        """Memoria/CPU del **proceso** de este backend, no del host -- en un despliegue
        multi-instancia (ADR-001), cada instancia reporta lo suyo; un número de host
        agregado no sería atribuible a ninguna instancia en particular. `None` si
        `psutil` no puede leer el proceso (nunca debería pasar en la práctica, pero un
        panel de monitoreo no debe caerse por esto)."""
        try:
            memory_mb = _PROCESS.memory_info().rss / (1024 * 1024)
            cpu_percent = _PROCESS.cpu_percent(interval=None)
            return round(memory_mb, 1), round(cpu_percent, 1)
        except Exception:  # noqa: BLE001
            logger.warning("process_resource_usage_read_failed")
            return None, None
