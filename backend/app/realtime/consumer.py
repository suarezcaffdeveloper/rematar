"""Event Consumer: escucha Redis Pub/Sub y alimenta al `EventDispatcher` (Épica 3,
Módulo 3.5). Ver docs/22-sincronizacion-tiempo-real.md y ADR-025.

Usa el cliente Redis compartido (`app.state.redis`, Módulo 3.1) directamente — no pasa
por `RedisPubSub` (`app/redis/pubsub.py`, Módulo 3.1) porque esa clase solo expone
suscripción a canales exactos y acá hace falta un patrón (`events.*`, un único
suscriptor para todos los remates en vez de una suscripción por sala). Es una lectura
adicional de la misma conexión compartida, no una reestructuración de la infraestructura
de Redis existente.
"""

import asyncio
import contextlib

import structlog
from redis.asyncio import Redis

from app.realtime.dispatcher import EventDispatcher

logger = structlog.get_logger(__name__)

DEFAULT_PATTERN = "events.*"


class EventConsumer:
    """Una única tarea de fondo por proceso, arrancada desde el `lifespan` de
    `app/main.py` (mismo patrón que `ConnectionManager`/`RoomManager`). Procesa los
    mensajes de a uno (`async for` secuencial, sin `asyncio.gather`) a propósito: es lo
    que garantiza que nunca haya dos `websocket.send_text()` concurrentes disparados
    por este consumidor hacia la misma conexión — ver ADR-025, sección C, para el
    análisis completo de por qué eso alcanza sin tocar `app/websocket/`."""

    def __init__(
        self,
        redis: Redis,
        dispatcher: EventDispatcher,
        *,
        pattern: str = DEFAULT_PATTERN,
        retry_base_seconds: float = 1.0,
        retry_max_seconds: float = 30.0,
    ) -> None:
        self._redis = redis
        self._dispatcher = dispatcher
        self._pattern = pattern
        self._retry_base_seconds = retry_base_seconds
        self._retry_max_seconds = retry_max_seconds
        self._task: asyncio.Task[None] | None = None
        self._attempt = 0

    def start(self) -> None:
        self._task = asyncio.create_task(self._run(), name="realtime-event-consumer")

    async def stop(self) -> None:
        if self._task is None:
            return
        self._task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await self._task
        self._task = None

    async def _run(self) -> None:
        self._attempt = 0
        while True:
            try:
                await self._listen_once()
                # `_listen_once` solo termina si la propia suscripción se cierra sin
                # error (no debería pasar en operación normal) -- tratarlo igual que
                # una desconexión: reintentar, no salir silenciosamente del consumer.
                logger.warning("realtime_consumer_listen_ended_unexpectedly")
            except asyncio.CancelledError:
                logger.info("realtime_consumer_stopped")
                raise
            except Exception:
                logger.exception("realtime_consumer_connection_lost", attempt=self._attempt)

            delay = min(self._retry_base_seconds * (2**self._attempt), self._retry_max_seconds)
            self._attempt += 1
            await asyncio.sleep(delay)

    async def _listen_once(self) -> None:
        pubsub = self._redis.pubsub()
        try:
            await pubsub.psubscribe(self._pattern)
            # Suscripción confirmada: resetea el backoff -- la próxima caída, si
            # ocurre mucho después de esta reconexión exitosa, vuelve a arrancar desde
            # `retry_base_seconds` en vez de seguir escalando indefinidamente.
            self._attempt = 0
            logger.info("realtime_consumer_subscribed", pattern=self._pattern)
            async for message in pubsub.listen():
                if message["type"] != "pmessage":
                    continue
                try:
                    await self._dispatcher.dispatch(message["data"])
                except Exception:
                    # Un evento roto no debe tirar abajo la suscripción entera -- se
                    # loguea acá porque `dispatcher.dispatch` ya no debería lanzar nunca
                    # (ver su propio docstring); esto es una red de seguridad extra.
                    logger.exception("realtime_event_dispatch_failed")
        finally:
            with contextlib.suppress(Exception):
                await pubsub.punsubscribe(self._pattern)
                await pubsub.aclose()
