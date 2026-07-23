"""Escenario: N compradores conectados simultáneamente a un mismo remate en vivo, sin
generar tráfico propio -- mide capacidad de conexión pura (RNF-04: al menos 2000
WebSockets concurrentes como objetivo de diseño). Parametrizado por `--num-buyers`:
correr con 100, 500 y 1000 son la misma lógica, tres valores distintos del flag (ver
docs/39-pruebas-de-carga-y-rendimiento.md).
"""

from __future__ import annotations

import argparse
import asyncio

from loadtest.client_http import wait_ready
from loadtest.config import RunConfig
from loadtest.fixtures import ensure_live_lote
from loadtest.identity import ensure_identity_pool
from loadtest.metrics import MetricsCollector
from loadtest.scenarios._shared import ConnectSpec, close_all, connect_many_ramped, try_start_monitoring

NAME = "connected_buyers"
DESCRIPTION = "N compradores conectados a un mismo remate en vivo (100/500/1000, RNF-04)"


def add_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--num-buyers", type=int, default=100, help="Compradores a conectar (default: 100)")
    parser.add_argument(
        "--ramp-up-seconds", type=float, default=10.0, help="Ventana de llegada de conexiones (default: 10s)"
    )
    parser.add_argument(
        "--hold-seconds", type=float, default=30.0, help="Cuánto mantener las conexiones abiertas (default: 30s)"
    )


async def run(config: RunConfig, args: argparse.Namespace) -> dict:
    await wait_ready(config.host)
    pool = await ensure_identity_pool(config, args.num_buyers)
    live_lote = await ensure_live_lote(config, pool.auctioneer)

    collector = MetricsCollector()
    poller = await try_start_monitoring(config, collector)

    specs = [ConnectSpec(token=buyer.access_token, remate_id=live_lote.remate_id) for buyer in pool.buyers]
    clients = await connect_many_ramped(config.ws_url, specs, collector, ramp_up_seconds=args.ramp_up_seconds)

    try:
        await asyncio.sleep(args.hold_seconds)
    finally:
        await close_all(clients)
        if poller is not None:
            await poller.stop()
    collector.finish()

    return collector.to_summary(
        scenario=NAME,
        config={
            "num_buyers": args.num_buyers,
            "ramp_up_seconds": args.ramp_up_seconds,
            "hold_seconds": args.hold_seconds,
            "connected_ok": len(clients),
        },
    )
