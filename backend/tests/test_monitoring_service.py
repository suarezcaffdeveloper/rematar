"""Tests de `MonitoringService` (Épica 8, Módulo 8.1), llamado directamente (sin pasar
por HTTP) contra Postgres/Redis reales -- mismo criterio que el resto de la suite. Los
tests de caída de Postgres/Redis usan un doble mínimo (no hay forma de tumbar la
infraestructura real de forma controlada en un test) -- `_BrokenSession`/`_BrokenRedis`
solo implementan el único método que `MonitoringService` llama, para forzar la rama de
error de cada chequeo.
"""

import uuid

import pytest_asyncio
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.monitoring.repository import MonitoringRepository
from app.monitoring.service import MonitoringService
from app.redis.metrics import RedisMetricsRecorder
from app.websocket.manager import ConnectionContext, ConnectionManager


@pytest_asyncio.fixture
async def redis_client():
    redis = Redis.from_url(get_settings().REDIS_URL, decode_responses=True)
    try:
        yield redis
    finally:
        await redis.flushdb()
        await redis.aclose()


class _BrokenSession:
    async def execute(self, *args, **kwargs):
        raise RuntimeError("postgres down")


class _BrokenRedis:
    async def ping(self):
        raise RuntimeError("redis down")


def _make_service(
    db_session: AsyncSession,
    redis_client: Redis,
    *,
    db: AsyncSession | None = None,
    redis: Redis | None = None,
    connection_manager: ConnectionManager | None = None,
) -> MonitoringService:
    return MonitoringService(
        MonitoringRepository(db_session),
        db if db is not None else db_session,
        redis if redis is not None else redis_client,
        connection_manager if connection_manager is not None else ConnectionManager(),
        RedisMetricsRecorder(redis_client),
    )


def _connection_context(user_id: uuid.UUID) -> ConnectionContext:
    return ConnectionContext(connection_id=uuid.uuid4(), user_id=user_id, websocket=object())


# --- check_health --------------------------------------------------------------------------


async def test_check_health_reports_ok_when_everything_is_up(
    db_session: AsyncSession, redis_client: Redis
) -> None:
    service = _make_service(db_session, redis_client)
    result = await service.check_health()

    assert result.status == "ok"
    components = {check.component: check.status for check in result.checks}
    assert components == {"api": "ok", "postgres": "ok", "redis": "ok", "websocket": "ok"}


async def test_check_health_reports_degraded_when_postgres_is_down(
    db_session: AsyncSession, redis_client: Redis
) -> None:
    service = _make_service(db_session, redis_client, db=_BrokenSession())
    result = await service.check_health()

    assert result.status == "degraded"
    components = {check.component: check.status for check in result.checks}
    assert components["postgres"] == "unavailable"
    assert components["redis"] == "ok"


async def test_check_health_reports_degraded_when_redis_is_down(
    db_session: AsyncSession, redis_client: Redis
) -> None:
    service = _make_service(db_session, redis_client, redis=_BrokenRedis())
    result = await service.check_health()

    assert result.status == "degraded"
    components = {check.component: check.status for check in result.checks}
    assert components["redis"] == "unavailable"
    assert components["postgres"] == "ok"


async def test_check_health_websocket_reports_ok_with_zero_connections(
    db_session: AsyncSession, redis_client: Redis
) -> None:
    """El chequeo de WebSocket nunca falla por "cero conexiones" -- es un estado
    válido, no una caída (ver docstring de `MonitoringService._check_websocket`)."""
    service = _make_service(db_session, redis_client, connection_manager=ConnectionManager())
    result = await service.check_health()

    websocket_check = next(check for check in result.checks if check.component == "websocket")
    assert websocket_check.status == "ok"
    assert "0 conexiones" in (websocket_check.detail or "")


# --- get_metrics ---------------------------------------------------------------------------


async def test_get_metrics_counts_connected_users_and_websockets(
    db_session: AsyncSession, redis_client: Redis
) -> None:
    connection_manager = ConnectionManager()
    user_a = uuid.uuid4()
    user_b = uuid.uuid4()
    await connection_manager.register(_connection_context(user_a))
    await connection_manager.register(_connection_context(user_a))  # misma persona, 2 pestañas
    await connection_manager.register(_connection_context(user_b))

    service = _make_service(db_session, redis_client, connection_manager=connection_manager)
    metrics = await service.get_metrics()

    assert metrics.active_websockets == 3
    assert metrics.connected_users == 2


async def test_get_metrics_reflects_recorded_timings_and_errors(
    db_session: AsyncSession, redis_client: Redis
) -> None:
    """`get_metrics` lee los buckets del minuto en curso vía `time.time()` real -- se
    registra con ese mismo reloj para que caiga en el bucket que `get_metrics` va a
    leer."""
    import time as _time  # noqa: PLC0415

    recorder = RedisMetricsRecorder(redis_client)
    now = _time.time()
    await recorder.record_timing("api_response", 40.0, now=now)
    await recorder.record_timing("api_response", 60.0, now=now)
    await recorder.record_timing("oferta_processing", 25.0, now=now)
    await recorder.record_event("errors_total", now=now)

    service = MonitoringService(
        MonitoringRepository(db_session),
        db_session,
        redis_client,
        ConnectionManager(),
        recorder,
    )
    metrics = await service.get_metrics()

    assert metrics.avg_api_response_ms == 50.0
    assert metrics.avg_oferta_processing_ms == 25.0
    assert metrics.errors_last_minute >= 1
    assert metrics.memory_usage_mb is not None
    assert metrics.cpu_usage_percent is not None


async def test_get_metrics_includes_global_ofertas_and_chat_counts(
    db_session: AsyncSession, redis_client: Redis
) -> None:
    service = _make_service(db_session, redis_client)
    metrics = await service.get_metrics()

    assert metrics.ofertas_per_minute >= 0
    assert metrics.chat_messages_per_minute >= 0
    assert metrics.errors_last_minute >= 0
