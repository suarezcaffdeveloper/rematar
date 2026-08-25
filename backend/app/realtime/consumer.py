"""Event Consumer: escucha Redis Pub/Sub y alimenta a un dispatcher (Épica 3, Módulo
3.5; generalizado en la Épica 6, Módulo 6.4). Ver docs/22-sincronizacion-tiempo-real.md,
docs/34-chat-del-remate.md, ADR-025 y ADR-037.

Usa el cliente Redis compartido (`app.state.redis`, Módulo 3.1) directamente — no pasa
por `RedisPubSub` (`app/redis/pubsub.py`, Módulo 3.1) porque esa clase solo expone
suscripción a canales exactos y acá hace falta un patrón (`events.*`, un único
suscriptor para todos los remates en vez de una suscripción por sala). Es una lectura
adicional de la misma conexión compartida, no una reestructuración de la infraestructura
de Redis existente.

`Dispatcher` es un `Protocol` (PEP 544), no la clase concreta `EventDispatcher` — desde
el Módulo 6.4, `app/main.py` instancia un **segundo** `EventConsumer` (independiente del
que ya reenvía eventos a los clientes WS) con un dispatcher distinto
(`ChatSystemEventDispatcher`, `app/modules/chat/realtime.py`) para generar mensajes de
sistema del chat — mismo mecanismo de suscripción y reconexión, sin duplicar ese código
(ADR-025, sección "Consecuencias", ya anticipaba: "cada uno [Chat/Notificaciones/
Presencia] agrega su propio consumidor/dispatcher"). Relajar el tipo no cambió ningún
comportamiento: `EventConsumer` solo llama `dispatcher.dispatch(...)`, nunca inspeccionó
nada propio de `EventDispatcher` — de hecho, `tests/test_realtime_consumer.py` ya
pasaba un dispatcher de prueba que no hereda de `EventDispatcher`, solo implementa
`dispatch`, así que esto ya funcionaba por duck typing antes de formalizarse acá.
"""

import asyncio
import contextlib
from typing import Protocol

import structlog
from redis.asyncio import Redis

logger = structlog.get_logger(__name__)

DEFAULT_PATTERN = "events.*"


class Dispatcher(Protocol):
    async def dispatch(self, raw_payload: str | bytes) -> None: ...


class EventConsumer:
    """Una única tarea de fondo por proceso, arrancada desde el `lifespan` de
    `app/main.py` (mismo patrón que `ConnectionManager`/`RoomManager`). Procesa los
    mensajes de a uno (bucle secuencial, sin `asyncio.gather`) a propósito: es lo
    que garantiza que nunca haya dos `websocket.send_text()` concurrentes disparados
    por este consumidor hacia la misma conexión — ver ADR-025, sección C, para el
    análisis completo de por qué eso alcanza sin tocar `app/websocket/`."""

    def __init__(
        self,
        redis: Redis,
        dispatcher: Dispatcher,
        *,
        pattern: str = DEFAULT_PATTERN,
        retry_base_seconds: float = 1.0,
        retry_max_seconds: float = 30.0,
        poll_timeout_seconds: float = 30.0,
    ) -> None:
        self._redis = redis
        self._dispatcher = dispatcher
        self._pattern = pattern
        self._retry_base_seconds = retry_base_seconds
        self._retry_max_seconds = retry_max_seconds
        self._poll_timeout_seconds = poll_timeout_seconds
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
            # `get_message(timeout=...)` en vez de `async for message in pubsub.listen()`:
            # `listen()` pide una lectura bloqueante *sin* timeout propio (`block=True`),
            # así que `redis-py` cae al `socket_timeout` de la conexión compartida
            # (`app/redis/client.py`, 5s) -- pensado para acotar comandos normales de
            # request/response, no una espera legítima de varios segundos u horas sin
            # publicaciones nuevas. El resultado: cada ventana idle de más de 5s se veía
            # como un `redis.exceptions.TimeoutError` real (conexión "perdida"), y este
            # consumidor reconectaba en bucle contra Redis sin que hubiera ningún problema
            # de red -- reproducido en producción (Railway + Upstash) como
            # `realtime_consumer_connection_lost` repetido cada pocos segundos en los seis
            # consumidores que arranca `app/main.py`, todos comparten `app.state.redis`.
            # `get_message` con un `timeout` explícito no tiene ese problema: `redis-py`
            # atrapa el `TimeoutError` de esa lectura puntual y devuelve `None` en vez de
            # propagarlo (ver `redis/asyncio/connection.py::read_response`), así que una
            # ventana sin mensajes es indistinguible de "nada nuevo todavía" -- ya no de
            # una desconexión real.
            while True:
                message = await pubsub.get_message(timeout=self._poll_timeout_seconds)
                if message is None or message["type"] != "pmessage":
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
