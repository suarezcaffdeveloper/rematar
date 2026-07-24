"""Estado efímero de moderación sobre Redis (Épica 7, Módulo 7.6). Ver
docs/42-moderacion-en-tiempo-real.md y ADR-045.

`ModerationRedisGateway` es, deliberadamente, tan liviano como `RedisRateLimiter`
(`app/redis/rate_limit.py`, que Chat ya usa): silenciar a un comprador y bloquear el
chat completo son sanciones **temporales** -- si el proceso reinicia y se pierden, el
peor caso es que la sanción termine antes de lo esperado, nunca que alguien expulsado
reingrese (eso sí es `RemateBan`, persistido en Postgres, ver `models.py`). Por eso viven
acá y no en una tabla nueva.

Es la superficie que `app/modules/chat/router.py` importa directamente (nunca
`app.moderation.service`, que compone mucho más: `ConnectionManager`/`RoomManager`/
`RemateService`/etc.) -- mismo criterio "solo la superficie de lectura que hace falta"
que domain modules ya aplican a `app.audit.repository`.
"""

import uuid

from redis.asyncio import Redis


def _mute_key(remate_id: uuid.UUID, user_id: uuid.UUID) -> str:
    return f"moderation:mute:{remate_id}:{user_id}"


def _chat_lock_key(remate_id: uuid.UUID) -> str:
    return f"moderation:chat_lock:{remate_id}"


def _invalid_bid_count_key(remate_id: uuid.UUID, buyer_id: uuid.UUID) -> str:
    return f"moderation:invalid_bids:{remate_id}:{buyer_id}"


def _invalid_bid_notified_key(remate_id: uuid.UUID, buyer_id: uuid.UUID) -> str:
    return f"moderation:invalid_bids_notified:{remate_id}:{buyer_id}"


class ModerationRedisGateway:
    def __init__(self, client: Redis) -> None:
        self._client = client

    async def mute(self, remate_id: uuid.UUID, user_id: uuid.UUID, duration_seconds: int) -> None:
        await self._client.set(_mute_key(remate_id, user_id), "1", ex=duration_seconds)

    async def is_muted(self, remate_id: uuid.UUID, user_id: uuid.UUID) -> bool:
        return bool(await self._client.exists(_mute_key(remate_id, user_id)))

    async def lock_chat(self, remate_id: uuid.UUID, duration_seconds: int) -> None:
        await self._client.set(_chat_lock_key(remate_id), "1", ex=duration_seconds)

    async def is_chat_locked(self, remate_id: uuid.UUID) -> bool:
        return bool(await self._client.exists(_chat_lock_key(remate_id)))

    async def record_invalid_bid_attempt(
        self, remate_id: uuid.UUID, buyer_id: uuid.UUID, *, window_seconds: int
    ) -> int:
        """Incrementa el contador de intentos inválidos de `(remate_id, buyer_id)` en la
        ventana actual y devuelve el conteo nuevo -- mismo patrón fixed-window
        (`INCR`+`EXPIRE`) que `RedisRateLimiter.check_and_increment`, pero sin techo: acá
        interesa saber *cuántos* lleva, no solo si superó un límite."""
        key = _invalid_bid_count_key(remate_id, buyer_id)
        count = await self._client.incr(key)
        if count == 1:
            await self._client.expire(key, window_seconds)
        return count

    async def has_notified_invalid_bid_threshold(
        self, remate_id: uuid.UUID, buyer_id: uuid.UUID
    ) -> bool:
        return bool(await self._client.exists(_invalid_bid_notified_key(remate_id, buyer_id)))

    async def mark_invalid_bid_threshold_notified(
        self, remate_id: uuid.UUID, buyer_id: uuid.UUID, *, window_seconds: int
    ) -> None:
        """Misma ventana que el contador -- para que la próxima ventana (nuevo período)
        pueda volver a notificar si el comprador reincide."""
        await self._client.set(
            _invalid_bid_notified_key(remate_id, buyer_id), "1", ex=window_seconds
        )
