"""Métricas genéricas sobre Redis (Épica 8, Módulo 8.1). Ver
docs/38-observabilidad-y-monitoreo.md y ADR-041.

Wrapper delgado, sin ningún conocimiento de dominio -- mismo criterio que
`RedisCache`/`RedisRateLimiter` (Módulos 3.1/6.4): quien lo usa decide el nombre de la
métrica; esta clase no sabe qué es "tiempo de una oferta" ni "requests de la API".

Fixed-window por minuto (mismo patrón `INCR`/`HINCRBY` + `EXPIRE` que
`RedisRateLimiter`, ver su docstring): cada `record_*` escribe en el bucket del minuto
en curso (`epoch // 60`), con un TTL de sobra (3 minutos) para poder leer el bucket
anterior sin que haya expirado todavía. `get_average_ms`/`get_count` agregan el bucket
actual + el anterior -- evita que la métrica caiga a `None`/`0` en el instante exacto en
que cruza un minuto sin actividad nueva todavía en el bucket nuevo.
"""

from redis.asyncio import Redis

_BUCKET_SECONDS = 60
_TTL_SECONDS = 180


def _bucket(epoch_seconds: float) -> int:
    return int(epoch_seconds // _BUCKET_SECONDS)


class RedisMetricsRecorder:
    def __init__(self, client: Redis) -> None:
        self._client = client

    async def record_timing(self, metric: str, duration_ms: float, *, now: float) -> None:
        """Acumula `duration_ms` en el bucket del minuto en curso -- `HINCRBYFLOAT` para
        la suma, `HINCRBY` para el conteo, ambos en el mismo HASH para que
        `get_average_ms` los lea con una sola consulta por bucket."""
        key = self._timing_key(metric, _bucket(now))
        await self._client.hincrby(key, "count", 1)
        await self._client.hincrbyfloat(key, "sum_ms", duration_ms)
        await self._client.expire(key, _TTL_SECONDS)

    async def get_average_ms(self, metric: str, *, now: float) -> float | None:
        current = _bucket(now)
        total_count = 0
        total_sum = 0.0
        for bucket in (current, current - 1):
            raw = await self._client.hgetall(self._timing_key(metric, bucket))
            if not raw:
                continue
            total_count += int(raw.get("count", 0))
            total_sum += float(raw.get("sum_ms", 0.0))
        if total_count == 0:
            return None
        return total_sum / total_count

    async def record_event(self, metric: str, *, now: float) -> None:
        """Contador simple (sin promedio) -- usado para conteos de eventos recientes
        (ej. `errors_total`), no para las tasas "por minuto" pedidas por el enunciado
        (esas salen de una consulta directa a Postgres, ver `MonitoringRepository` --
        más precisas que un contador en memoria/Redis para un dato que ya se persiste)."""
        key = self._count_key(metric, _bucket(now))
        count = await self._client.incr(key)
        if count == 1:
            await self._client.expire(key, _TTL_SECONDS)

    async def get_count(self, metric: str, *, now: float) -> int:
        """Solo el bucket del minuto en curso -- a diferencia de `get_average_ms`, acá
        no se suma el bucket anterior: un conteo de eventos recientes cayendo a `0`
        justo después de cruzar un minuto es una lectura correcta, no un hueco de
        datos que haya que suavizar."""
        raw = await self._client.get(self._count_key(metric, _bucket(now)))
        return int(raw) if raw else 0

    @staticmethod
    def _timing_key(metric: str, bucket: int) -> str:
        return f"metrics:timing:{metric}:{bucket}"

    @staticmethod
    def _count_key(metric: str, bucket: int) -> str:
        return f"metrics:count:{metric}:{bucket}"
