"""Tests de `EventConsumer` (Épica 3, Módulo 3.5), en aislamiento total de Redis real:
un cliente Redis falso que simula conexiones y desconexiones controladas, para
verificar reconexión automática con backoff sin depender de temporizadores reales ni de
un servidor Redis. Los tests de punta a punta contra Redis real están en
`test_realtime_sync.py`.
"""

import asyncio

from app.realtime.consumer import EventConsumer


class _FakePubSub:
    """Simula lo mínimo de `redis.asyncio.client.PubSub` que `EventConsumer` usa.
    Tras entregar los mensajes preparados, por defecto se queda "conectada" sin emitir
    nada más (`asyncio.Event().wait()`, nunca se resuelve) -- evita que un test
    reconecte en bucle infinito cuando el escenario que quiere probar es otro. Para
    simular una caída de conexión real, usar `disconnect_after_messages=True`."""

    def __init__(
        self,
        *,
        fail_on_subscribe: bool = False,
        messages: list[dict] | None = None,
        disconnect_after_messages: bool = False,
    ) -> None:
        self._fail_on_subscribe = fail_on_subscribe
        self._messages = messages or []
        self._disconnect_after_messages = disconnect_after_messages
        self.psubscribed_to: list[str] = []

    async def psubscribe(self, pattern: str) -> None:
        if self._fail_on_subscribe:
            raise ConnectionError("Redis no disponible")
        self.psubscribed_to.append(pattern)

    async def get_message(self, timeout: float):
        """Simula `PubSub.get_message(timeout=...)`: entrega los mensajes preparados de
        a uno; agotados, levanta la desconexión simulada (si corresponde) o devuelve
        `None` repetidamente -- igual que el `redis-py` real cuando la ventana de
        `timeout` pasa sin publicaciones nuevas (se queda "conectada", sin más
        mensajes)."""
        if self._messages:
            return self._messages.pop(0)
        if self._disconnect_after_messages:
            raise ConnectionError("conexión perdida")
        await asyncio.sleep(0.01)
        return None

    async def punsubscribe(self, pattern: str) -> None:
        pass

    async def aclose(self) -> None:
        pass


class _FakeRedis:
    """Cada llamada a `.pubsub()` devuelve el siguiente `_FakePubSub` de una lista
    preparada -- permite simular "las primeras N conexiones fallan, la siguiente
    funciona", exactamente el escenario de reconexión automática. Si la lista se agota,
    repite la última entrada."""

    def __init__(self, pubsub_sequence: list[_FakePubSub]) -> None:
        self._sequence = list(pubsub_sequence)
        self.pubsub_call_count = 0

    def pubsub(self) -> _FakePubSub:
        pubsub = self._sequence[min(self.pubsub_call_count, len(self._sequence) - 1)]
        self.pubsub_call_count += 1
        return pubsub


class _RecordingDispatcher:
    def __init__(self) -> None:
        self.dispatched: list[str] = []

    async def dispatch(self, raw_payload) -> None:
        self.dispatched.append(raw_payload)


async def _wait_until(condition, *, attempts: int = 100, interval: float = 0.01) -> None:
    for _ in range(attempts):
        if condition():
            return
        await asyncio.sleep(interval)
    raise AssertionError("condición no se cumplió a tiempo")


async def test_consumer_subscribes_and_dispatches_pmessages() -> None:
    pubsub = _FakePubSub(
        messages=[
            {"type": "subscribe", "data": 1},  # confirmación de suscripción -- se ignora
            {"type": "pmessage", "data": '{"event_type": "remate.started"}'},
        ]
    )
    redis = _FakeRedis([pubsub])
    dispatcher = _RecordingDispatcher()
    consumer = EventConsumer(redis, dispatcher, retry_base_seconds=0.01, retry_max_seconds=0.02)

    consumer.start()
    await _wait_until(lambda: len(dispatcher.dispatched) == 1)
    await consumer.stop()

    assert pubsub.psubscribed_to == ["events.*"]
    assert dispatcher.dispatched == ['{"event_type": "remate.started"}']


async def test_consumer_ignores_non_pmessage_types() -> None:
    pubsub = _FakePubSub(
        messages=[
            {"type": "psubscribe", "data": 1},
            {"type": "pmessage", "data": "payload-real"},
        ]
    )
    redis = _FakeRedis([pubsub])
    dispatcher = _RecordingDispatcher()
    consumer = EventConsumer(redis, dispatcher, retry_base_seconds=0.01, retry_max_seconds=0.02)

    consumer.start()
    await _wait_until(lambda: len(dispatcher.dispatched) == 1)
    await consumer.stop()

    assert dispatcher.dispatched == ["payload-real"]


async def test_consumer_reconnects_after_subscribe_failure() -> None:
    failing = _FakePubSub(fail_on_subscribe=True)
    working = _FakePubSub(messages=[{"type": "pmessage", "data": "llego-tras-reconectar"}])
    redis = _FakeRedis([failing, failing, working])
    dispatcher = _RecordingDispatcher()
    consumer = EventConsumer(redis, dispatcher, retry_base_seconds=0.01, retry_max_seconds=0.02)

    consumer.start()
    await _wait_until(lambda: len(dispatcher.dispatched) == 1)
    await consumer.stop()

    assert redis.pubsub_call_count == 3  # 2 intentos fallidos + el que funcionó
    assert dispatcher.dispatched == ["llego-tras-reconectar"]


async def test_consumer_reconnects_after_mid_stream_disconnect() -> None:
    first = _FakePubSub(
        messages=[{"type": "pmessage", "data": "antes-de-la-caida"}],
        disconnect_after_messages=True,
    )
    second = _FakePubSub(messages=[{"type": "pmessage", "data": "despues-de-reconectar"}])
    redis = _FakeRedis([first, second])
    dispatcher = _RecordingDispatcher()
    consumer = EventConsumer(redis, dispatcher, retry_base_seconds=0.01, retry_max_seconds=0.02)

    consumer.start()
    await _wait_until(lambda: len(dispatcher.dispatched) == 2)
    await consumer.stop()

    assert redis.pubsub_call_count == 2
    assert dispatcher.dispatched == ["antes-de-la-caida", "despues-de-reconectar"]


async def test_consumer_dispatch_error_does_not_kill_the_loop() -> None:
    pubsub = _FakePubSub(
        messages=[
            {"type": "pmessage", "data": "primero-falla"},
            {"type": "pmessage", "data": "segundo-llega-igual"},
        ]
    )
    redis = _FakeRedis([pubsub])

    class _DispatcherThatFailsOnce:
        def __init__(self) -> None:
            self.calls = 0
            self.dispatched: list[str] = []

        async def dispatch(self, raw_payload) -> None:
            self.calls += 1
            if self.calls == 1:
                raise RuntimeError("boom")
            self.dispatched.append(raw_payload)

    dispatcher = _DispatcherThatFailsOnce()
    consumer = EventConsumer(redis, dispatcher, retry_base_seconds=0.01, retry_max_seconds=0.02)

    consumer.start()
    await _wait_until(lambda: len(dispatcher.dispatched) == 1)
    await consumer.stop()

    assert dispatcher.dispatched == ["segundo-llega-igual"]


async def test_stop_cancels_the_background_task_cleanly() -> None:
    pubsub = _FakePubSub()  # sin mensajes -- se queda "conectada" esperando
    redis = _FakeRedis([pubsub])
    dispatcher = _RecordingDispatcher()
    consumer = EventConsumer(redis, dispatcher, retry_base_seconds=0.01, retry_max_seconds=0.02)

    consumer.start()
    await asyncio.sleep(0.05)
    await consumer.stop()

    assert consumer._task is None  # noqa: SLF001 -- test interno del propio módulo
