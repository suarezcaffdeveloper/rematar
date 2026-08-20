"""Rate limiting y protección DoS del Gateway WebSocket (Fase 4 de remediación del
WebSocket Security Audit). Ver docs/20-gateway-websocket.md, ADR-023, y las Fases 1-3
(app/realtime/privilege.py, app/websocket/router.py, app/modules/auth/realtime.py) que
esta fase no modifica.

Cubre CLIENTE -> SERVIDOR únicamente (conexiones nuevas, mensajes, join_room/leave_room)
-- nunca SERVIDOR -> CLIENTE: `EventDispatcher` (app/realtime/dispatcher.py) sigue
entregando eventos de dominio sin ningún throttling, a propósito (un remate activo no
puede perder ofertas/eventos por un rate limiter mal aplicado).

## Dos tipos de límite, dos mecanismos distintos

La mayoría de los controles de acá ("¿cuántos eventos en esta ventana de tiempo?") son
una TASA -- se resuelven reutilizando `RedisRateLimiter` (`app/redis/rate_limit.py`,
fixed-window INCR+EXPIRE, ya usado por Chat y por el rate limit de recuperación de
contraseña): conexiones nuevas por IP, mensajes por conexión, acciones de sala por
usuario. `WSRateLimiter.allow` es el único punto de entrada a esos tres.

El límite de conexiones SIMULTÁNEAS por usuario es distinto: es un GAUGE ("¿cuántas hay
abiertas ahora mismo?"), no una tasa, y una ventana fixed-window de Redis no modela bien
"ahora mismo" cuando cada conexión puede durar horas (un remate largo). Se resuelve con
`user_connection_limit_exceeded`, que reutiliza `ConnectionManager.connections_for_user`
-- ya en memoria, exacto por proceso, sin Redis. Ver su docstring para la limitación
documentada en un despliegue multi-instancia.

## Redis caído (sección 15 del audit)

Los tres controles basados en `WSRateLimiter.allow` fallan ABIERTOS (permiten la
operación) si la llamada a Redis en sí lanza una excepción -- no al superar el límite,
que sigue rechazando con normalidad, sino específicamente cuando Redis no responde.
Decisión deliberada, no un descuido:

1. Redis ya es una dependencia dura del resto del Gateway (Pub/Sub de eventos, caché de
   snapshot) -- si Redis está caído, el tiempo real ya está degradado para todos; este
   rate limiter fallando cerrado no añade seguridad real adicional en ese escenario.
2. Fallar cerrado en el límite de mensajes/acciones de sala desconectaría a TODOS los
   clientes ya conectados en la primera ventana que expire durante el blip -- un blip de
   Redis de unos segundos se convertiría en una caída total del Gateway para una
   plataforma de remates en vivo, un costo de disponibilidad muy superior al riesgo
   marginal de abuso durante ese mismo blip.
3. Otras capas siguen intactas incluso con Redis caído: la autenticación (JWT + consulta
   a Postgres, sin Redis) se sigue exigiendo igual, y el límite de conexiones simultáneas
   por usuario (en memoria, sin Redis) sigue aplicando sin cambios.

Cada fallo se loguea en WARNING (`ws_rate_limit_redis_unavailable`, con el `scope` que
falló) para que sea observable/alertable -- "fail open" acá es una decisión visible y
documentada, no un bypass silencioso.
"""

import uuid
from typing import Annotated

import structlog
from fastapi import Depends
from redis.asyncio import Redis
from redis.exceptions import RedisError

from app.redis.dependencies import get_redis_client
from app.redis.rate_limit import RedisRateLimiter
from app.websocket.manager import ConnectionManager

logger = structlog.get_logger(__name__)


class WSRateLimiter:
    """Wrapper sobre `RedisRateLimiter` que además decide qué pasa si Redis falla (ver
    docstring del módulo) -- `RedisRateLimiter` en sí no toma esa decisión, igual que
    tampoco la toma hoy `ChatService` (que deja propagar cualquier excepción de Redis,
    porque para chat un fallo ahí no tiene la misma disyuntiva de disponibilidad que acá
    -- perder un mensaje de chat puntual no es lo mismo que desconectar cada cliente
    activo del remate)."""

    def __init__(self, client: Redis) -> None:
        self._limiter = RedisRateLimiter(client)

    async def allow(self, key: str, *, limit: int, window_seconds: int, scope: str) -> bool:
        try:
            return await self._limiter.check_and_increment(
                key, limit=limit, window_seconds=window_seconds
            )
        except RedisError:
            logger.warning("ws_rate_limit_redis_unavailable", scope=scope, key=key)
            return True


def get_ws_rate_limiter(client: Annotated[Redis, Depends(get_redis_client)]) -> WSRateLimiter:
    return WSRateLimiter(client)


# --- Claves de Redis -------------------------------------------------------------------
# Un prefijo común (`ws:ratelimit:`) y un scope por segmento -- mismo criterio de
# namespacing que `moderation/redis_state.py` (`moderation:mute:...`) -- para poder
# distinguir de un vistazo, en `redis-cli`/logs, a qué control pertenece cada key.


def ip_connect_key(client_ip: str) -> str:
    """`client_ip`: `websocket.client.host` (sin soporte de `X-Forwarded-For` -- este
    despliegue no corre detrás de un reverse proxy que reescriba la IP de origen; si en
    el futuro se agrega uno, hará falta confiar únicamente en un proxy conocido antes de
    leer ese header, ver OWASP)."""
    return f"ws:ratelimit:connect_ip:{client_ip}"


def connection_message_key(connection_id: uuid.UUID) -> str:
    return f"ws:ratelimit:msg:{connection_id}"


def user_room_action_key(user_id: uuid.UUID) -> str:
    return f"ws:ratelimit:room_action:{user_id}"


def user_connection_limit_exceeded(
    manager: ConnectionManager, user_id: uuid.UUID, *, max_connections: int
) -> bool:
    """Gauge en memoria, no Redis -- ver docstring del módulo. Se llama justo antes de
    `ConnectionManager.register`, sin ningún `await` en el medio (ni acá ni en el
    llamador, ver `app/websocket/router.py`): la misma garantía de atomicidad que ya
    documenta `ConnectionManager` ("mutación de dict entre puntos de await es atómica en
    asyncio") cubre también esta lectura+decisión, sin necesitar un lock.

    ## Limitación documentada en multi-instancia

    En un despliegue con más de una réplica del backend (no el caso hoy -- ver
    docker-compose.yml, una única réplica), cada instancia solo ve sus propias conexiones
    en memoria: el límite efectivo por usuario pasa a ser
    `WS_MAX_CONNECTIONS_PER_USER * cantidad_de_instancias`, no el valor exacto
    configurado. Es una degradación graciosa, no un bypass total (sigue habiendo un techo
    finito, y el límite por IP -- ese sí con Redis, ver `WSRateLimiter` -- sigue aplicando
    sin esta limitación), y evita construir un registro distribuido de presencia
    (sorted-set con refresco por heartbeat + limpieza de entradas obsoletas) solo para
    esta fase, cuando el despliegue real no lo necesita todavía."""
    return len(manager.connections_for_user(user_id)) >= max_connections
