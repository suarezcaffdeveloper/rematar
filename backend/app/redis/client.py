"""Cliente Redis compartido (Épica 3, Módulo 3.1). Ver docs/18-integracion-redis.md y
docs/adr/ADR-021-integracion-de-redis.md para el razonamiento completo.

A diferencia de `app/db/session.py` (una `AsyncSession` *nueva en cada request*, porque
cada request es una transacción de negocio independiente), acá se construye **una única
instancia** de `redis.asyncio.Redis` que se reutiliza durante toda la vida del proceso —
la propia librería ya administra un pool de conexiones TCP pensado para eso. Este
archivo solo sabe **cómo** construir ese cliente; **cuándo** se crea y se cierra es
responsabilidad del `lifespan` de `app/main.py` (el único lugar que debe conocer el
ciclo de vida de la aplicación completa).

`decode_responses=True`: todo lo que este proyecto va a guardar en Redis (mensajes de
Pub/Sub, valores de cache, campos de Streams) es texto — mayormente JSON serializado —
así que se decodifica una única vez acá, no en cada módulo que lo use.
"""

from redis.asyncio import Redis

from app.core.config import Settings


def build_redis_client(settings: Settings) -> Redis:
    """Construye el cliente compartido. No conecta todavía: `redis-py` abre el socket
    de forma perezosa, recién en el primer comando real (ver ADR-021, sección B)."""
    return Redis.from_url(settings.REDIS_URL, decode_responses=True)
