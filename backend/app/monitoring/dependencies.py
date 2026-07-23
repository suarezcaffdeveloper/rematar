from typing import Annotated

from fastapi import Depends, Request
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.monitoring.repository import MonitoringRepository
from app.monitoring.service import MonitoringService
from app.redis.dependencies import get_metrics_recorder, get_redis_client
from app.redis.metrics import RedisMetricsRecorder
from app.websocket.manager import ConnectionManager


def get_monitoring_repository(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> MonitoringRepository:
    return MonitoringRepository(db)


def _get_connection_manager(request: Request) -> ConnectionManager:
    """Mismo criterio ya aceptado en `app/presence/dependencies.py`: duplicar este
    accessor privado en vez de reutilizar `app/websocket/dependencies.py` (que exige un
    `WebSocket` específico, no un `Request` HTTP plano) -- Monitoring es HTTP-only, no
    necesita el soporte dual que sí necesita Presencia."""
    return request.app.state.connection_manager


def get_monitoring_service(
    repository: Annotated[MonitoringRepository, Depends(get_monitoring_repository)],
    db: Annotated[AsyncSession, Depends(get_db)],
    redis_client: Annotated[Redis, Depends(get_redis_client)],
    connection_manager: Annotated[ConnectionManager, Depends(_get_connection_manager)],
    metrics_recorder: Annotated[RedisMetricsRecorder, Depends(get_metrics_recorder)],
) -> MonitoringService:
    return MonitoringService(repository, db, redis_client, connection_manager, metrics_recorder)
