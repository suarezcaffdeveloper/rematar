"""Cache de lectura genérica sobre Redis (Épica 3, Módulo 3.1).

Wrapper delgado, sin ningún conocimiento de dominio: un módulo futuro que necesite
cachear algo (por ejemplo, un catálogo de categorías, o un remate ya finalizado que no
cambia más) instancia `RedisCache(cliente)` vía `Depends(get_cache)` y usa `get`/`set`
con sus propias claves — esta clase no decide qué se cachea, con qué clave, ni por
cuánto tiempo. Ver docs/18-integracion-redis.md.
"""

from datetime import timedelta

from redis.asyncio import Redis


class RedisCache:
    def __init__(self, client: Redis) -> None:
        self._client = client

    async def get(self, key: str) -> str | None:
        return await self._client.get(key)

    async def set(self, key: str, value: str, *, ttl: timedelta | int | None = None) -> None:
        await self._client.set(key, value, ex=ttl)

    async def delete(self, key: str) -> None:
        await self._client.delete(key)

    async def exists(self, key: str) -> bool:
        return bool(await self._client.exists(key))
