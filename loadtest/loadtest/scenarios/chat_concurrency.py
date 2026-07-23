"""Escenario: chat con alta concurrencia -- N compradores conectados por WebSocket a la
sala de un remate (para recibir el broadcast de cada mensaje), enviando mensajes por
`POST /remates/{id}/chat/messages` a una tasa configurable. El rate limiting existente
(`CHAT_RATE_LIMIT_MAX_MESSAGES`/`CHAT_RATE_LIMIT_WINDOW_SECONDS`, 5 mensajes/10s por
usuario, docs/34-chat-del-remate.md) no se desactiva ni se evita -- una parte esperable
de la carga es precisamente ver cuántos mensajes terminan en 429, que es el
comportamiento correcto del sistema bajo ráfaga, no una falla.

Mide mensajes WebSocket por segundo (el broadcast que cada conectado recibe) y latencia
del POST de envío.
"""

from __future__ import annotations

import argparse
import asyncio
import time

import httpx

from loadtest.client_http import HttpClient, wait_ready
from loadtest.config import RunConfig
from loadtest.fixtures import ensure_live_lote
from loadtest.identity import ensure_identity_pool
from loadtest.metrics import MetricsCollector
from loadtest.scenarios._shared import ConnectSpec, close_all, connect_many_ramped, try_start_monitoring

NAME = "chat_concurrency"
DESCRIPTION = "Chat con alta concurrencia: N compradores conectados enviando mensajes a una tasa dada"


def add_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--num-buyers", type=int, default=100, help="Compradores en la sala (default: 100)")
    parser.add_argument("--ramp-up-seconds", type=float, default=10.0)
    parser.add_argument("--duration-seconds", type=float, default=30.0)
    parser.add_argument(
        "--senders-fraction",
        type=float,
        default=0.3,
        help="Fracción del pool que además de estar conectada, envía mensajes (default: 0.3)",
    )
    parser.add_argument(
        "--message-interval-seconds",
        type=float,
        default=3.0,
        help="Cada cuánto un emisor manda un mensaje (default: 3s -- deliberadamente cerca "
        "del límite de rate limiting para observar 429s realistas)",
    )


async def run(config: RunConfig, args: argparse.Namespace) -> dict:
    await wait_ready(config.host)
    pool = await ensure_identity_pool(config, args.num_buyers)
    live_lote = await ensure_live_lote(config, pool.auctioneer)

    collector = MetricsCollector()

    def on_domain_event(message: dict, receive_time: float) -> None:
        if message.get("event_type") == "chat.message_sent":
            collector.record_ws_message_received(receive_time)

    poller = await try_start_monitoring(config, collector)

    specs = [
        ConnectSpec(token=buyer.access_token, remate_id=live_lote.remate_id, on_domain_event=on_domain_event)
        for buyer in pool.buyers
    ]
    clients = await connect_many_ramped(config.ws_url, specs, collector, ramp_up_seconds=args.ramp_up_seconds)

    senders_count = max(1, int(len(pool.buyers) * args.senders_fraction))
    senders = pool.buyers[:senders_count]
    stop_at = time.monotonic() + args.duration_seconds
    path = f"/remates/{live_lote.remate_id}/chat/messages"

    try:
        async with HttpClient(config.api_base_url, on_sample=collector.record_http) as client:

            async def sender(token: str, index: int) -> None:
                headers = {"Authorization": f"Bearer {token}"}
                counter = 0
                while time.monotonic() < stop_at:
                    counter += 1
                    try:
                        response = await client.post(
                            path,
                            json={"content": f"carga #{index}-{counter}"},
                            headers=headers,
                            label="send_chat_message",
                        )
                    except httpx.HTTPError as exc:
                        collector.record_error(f"send_chat_message -> {exc!r}")
                    else:
                        if response.status_code == 429:
                            collector.record_ws_message_sent(time.time())  # intento, no error
                        elif response.status_code >= 400:
                            collector.record_error(f"send_chat_message -> HTTP {response.status_code}")
                    await asyncio.sleep(args.message_interval_seconds)

            await asyncio.gather(*(sender(buyer.access_token, i) for i, buyer in enumerate(senders)))

        await asyncio.sleep(2.0)  # margen para que el último broadcast llegue antes de cerrar
    finally:
        await close_all(clients)
        if poller is not None:
            await poller.stop()
    collector.finish()

    return collector.to_summary(
        scenario=NAME,
        config={
            "num_buyers": args.num_buyers,
            "senders_count": senders_count,
            "duration_seconds": args.duration_seconds,
            "message_interval_seconds": args.message_interval_seconds,
            "connected_ok": len(clients),
        },
    )
