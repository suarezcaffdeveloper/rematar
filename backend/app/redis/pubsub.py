"""Pub/Sub genérico sobre Redis (Épica 3, Módulo 3.1) — el mecanismo que ADR-009
(Fase 0) ya eligió como backplane de fan-out entre instancias de backend para el tiempo
real.

Todavía sin ningún canal de dominio: `publish`/`subscribe` reciben el nombre de canal
como parámetro de quien los llama. El módulo de tiempo real (Épica 3.2) es quien decide
qué canales existen (probablemente uno por remate) y qué forma tienen los mensajes — acá
solo se prepara el mecanismo. Ver docs/18-integracion-redis.md.
"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from redis.asyncio import Redis
from redis.asyncio.client import PubSub


class RedisPubSub:
    def __init__(self, client: Redis) -> None:
        self._client = client

    async def publish(self, channel: str, message: str) -> int:
        """Devuelve la cantidad de suscriptores que recibieron el mensaje — puede ser 0
        si nadie estaba escuchando en ese instante. Es el comportamiento esperado de
        Pub/Sub (sin persistencia, ver R-04/ADR-009), no un error."""
        return await self._client.publish(channel, message)

    @asynccontextmanager
    async def subscribe(self, *channels: str) -> AsyncIterator[PubSub]:
        """Context manager async: entrega el objeto `PubSub` de `redis-py`, ya
        suscripto a `channels`, listo para iterar (`async for message in pubsub.listen()`).
        Se desuscribe y cierra automáticamente al salir del bloque `async with`."""
        pubsub = self._client.pubsub()
        await pubsub.subscribe(*channels)
        try:
            yield pubsub
        finally:
            await pubsub.unsubscribe(*channels)
            await pubsub.aclose()
