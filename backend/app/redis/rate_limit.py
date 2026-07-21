"""Rate limiting genérico sobre Redis (Épica 6, Módulo 6.4). Ver
docs/34-chat-del-remate.md y ADR-037.

Wrapper delgado, sin ningún conocimiento de dominio -- mismo criterio que
`RedisCache`/`RedisLockFactory` (Módulo 3.1): quien lo usa decide la clave, el límite y
la ventana; esta clase no sabe qué es un mensaje de chat. Fixed-window sobre `INCR` +
`EXPIRE`: no es tan preciso como una ventana deslizante (permite ráfagas en el borde de
dos ventanas consecutivas), pero es "básico" tal como pide el enunciado, atómico por
comando (`INCR` es atómico en Redis) y no necesita un script Lua ni una estructura de
datos más compleja para un límite de este tamaño.
"""

from redis.asyncio import Redis


class RedisRateLimiter:
    def __init__(self, client: Redis) -> None:
        self._client = client

    async def check_and_increment(self, key: str, *, limit: int, window_seconds: int) -> bool:
        """Incrementa el contador de `key` y devuelve `True` si todavía está dentro del
        límite (incluyendo este intento), `False` si ya lo superó. El TTL de la ventana
        se fija únicamente en el primer incremento (`count == 1`) -- los siguientes
        reusan la expiración ya en curso, para que la ventana sea fija desde el primer
        golpe, no se extienda con cada intento nuevo."""
        count = await self._client.incr(key)
        if count == 1:
            await self._client.expire(key, window_seconds)
        return count <= limit
