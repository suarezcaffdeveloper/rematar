"""Locks distribuidos genéricos sobre Redis (Épica 3, Módulo 3.1).

Implementación estándar de `redis-py` (`SET NX PX` con token de propietario y
expiración, ver `redis.asyncio.lock.Lock`) — no una reinvención propia.

**No reemplaza** el `SELECT ... FOR UPDATE` de PostgreSQL que el Auction Engine ya usa
para decidir quién ganó una oferta (ADR-004): esa sigue siendo, sin excepción,
responsabilidad exclusiva de Postgres. Este lock es para coordinación entre instancias
de backend que **no** decida un resultado de negocio — por ejemplo, asegurar que una
tarea futura corra una sola vez entre varias réplicas. Ver docs/18-integracion-redis.md.
"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from redis.asyncio import Redis
from redis.asyncio.lock import Lock


class RedisLockFactory:
    def __init__(self, client: Redis) -> None:
        self._client = client

    @asynccontextmanager
    async def acquire(
        self, key: str, *, timeout: float = 10.0, blocking_timeout: float = 5.0
    ) -> AsyncIterator[Lock]:
        """`timeout`: cuánto puede durar el lock antes de expirar solo (evita que un
        proceso caído lo deje tomado para siempre). `blocking_timeout`: cuánto esperar
        para adquirirlo antes de desistir."""
        lock = self._client.lock(key, timeout=timeout, blocking_timeout=blocking_timeout)
        acquired = await lock.acquire()
        if not acquired:
            raise TimeoutError(f"No se pudo adquirir el lock '{key}' a tiempo.")
        try:
            yield lock
        finally:
            await lock.release()
