"""Tests de `RedisMetricsRecorder` (Épica 8, Módulo 8.1), directos contra Redis real
(sin mocks, mismo criterio que el resto de la suite -- ver docstring de
`tests/conftest.py`). `now` se pasa explícito en cada llamada para poder controlar en
qué bucket de minuto cae cada operación, sin depender de `time.time()` real.
"""

import pytest_asyncio
from redis.asyncio import Redis

from app.core.config import get_settings
from app.redis.metrics import RedisMetricsRecorder

MINUTE = 60


@pytest_asyncio.fixture
async def redis_client():
    redis = Redis.from_url(get_settings().REDIS_URL, decode_responses=True)
    try:
        yield redis
    finally:
        await redis.flushdb()
        await redis.aclose()


# --- record_timing / get_average_ms -----------------------------------------------------


async def test_get_average_ms_with_no_data_returns_none(redis_client: Redis) -> None:
    recorder = RedisMetricsRecorder(redis_client)
    assert await recorder.get_average_ms("nonexistent", now=1_000_000.0) is None


async def test_record_timing_and_get_average_ms(redis_client: Redis) -> None:
    recorder = RedisMetricsRecorder(redis_client)
    now = 1_000_000.0

    await recorder.record_timing("api_response", 100.0, now=now)
    await recorder.record_timing("api_response", 200.0, now=now)
    await recorder.record_timing("api_response", 300.0, now=now)

    average = await recorder.get_average_ms("api_response", now=now)
    assert average == 200.0


async def test_get_average_ms_smooths_over_the_previous_minute_bucket(redis_client: Redis) -> None:
    """Justo al cruzar un minuto, el bucket nuevo todavía no tiene datos -- se suma el
    bucket anterior para no mostrar `None`/un promedio vacío por un instante."""
    recorder = RedisMetricsRecorder(redis_client)
    minute_0 = 1_000_000.0 - (1_000_000.0 % MINUTE)  # inicio exacto de un minuto

    await recorder.record_timing("oferta_processing", 50.0, now=minute_0 - 1)  # minuto anterior
    # todavía no se registró nada en el minuto nuevo

    average = await recorder.get_average_ms("oferta_processing", now=minute_0 + 1)
    assert average == 50.0


async def test_get_average_ms_does_not_mix_unrelated_metrics(redis_client: Redis) -> None:
    recorder = RedisMetricsRecorder(redis_client)
    now = 1_000_000.0

    await recorder.record_timing("api_response", 100.0, now=now)
    await recorder.record_timing("oferta_processing", 999.0, now=now)

    assert await recorder.get_average_ms("api_response", now=now) == 100.0
    assert await recorder.get_average_ms("oferta_processing", now=now) == 999.0


# --- record_event / get_count -------------------------------------------------------------


async def test_get_count_with_no_data_returns_zero(redis_client: Redis) -> None:
    recorder = RedisMetricsRecorder(redis_client)
    assert await recorder.get_count("errors_total", now=1_000_000.0) == 0


async def test_record_event_and_get_count(redis_client: Redis) -> None:
    recorder = RedisMetricsRecorder(redis_client)
    now = 1_000_000.0

    await recorder.record_event("errors_total", now=now)
    await recorder.record_event("errors_total", now=now)
    await recorder.record_event("errors_total", now=now)

    assert await recorder.get_count("errors_total", now=now) == 3


async def test_get_count_only_reads_the_current_minute_bucket(redis_client: Redis) -> None:
    """A diferencia de `get_average_ms`, `get_count` no suavea con el bucket anterior
    -- caer a 0 justo después de cruzar un minuto es una lectura correcta."""
    recorder = RedisMetricsRecorder(redis_client)
    minute_0 = 1_000_000.0 - (1_000_000.0 % MINUTE)

    await recorder.record_event("errors_total", now=minute_0 - 1)  # minuto anterior

    assert await recorder.get_count("errors_total", now=minute_0 + 1) == 0
