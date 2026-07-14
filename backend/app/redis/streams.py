"""Streams genérico sobre Redis (Épica 3, Módulo 3.1).

Se prepara como capacidad de infraestructura disponible aunque ADR-009 (Fase 0) ya
decidió no usar Streams *para el fan-out de tiempo real* (ese rol lo cumple Pub/Sub, ver
`app/redis/pubsub.py`) — no hay contradicción: Streams queda disponible para cualquier
necesidad futura distinta (por ejemplo, una cola de trabajo simple), no para difusión en
vivo. Ver docs/18-integracion-redis.md.
"""

from typing import Any

from redis.asyncio import Redis


class RedisStreams:
    def __init__(self, client: Redis) -> None:
        self._client = client

    async def add(
        self, stream: str, fields: dict[str, str], *, maxlen: int | None = None
    ) -> str:
        return await self._client.xadd(stream, fields, maxlen=maxlen, approximate=True)

    async def read(
        self, stream: str, *, count: int = 10, last_id: str = "0"
    ) -> list[Any]:
        return await self._client.xread({stream: last_id}, count=count)
