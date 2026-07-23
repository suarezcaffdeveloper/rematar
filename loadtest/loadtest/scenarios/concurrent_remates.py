"""Escenario: múltiples remates simultáneos, cada uno con su propia sala y su propio
grupo de compradores -- a diferencia de `connected_buyers` (todos en una sala), acá se
reparte el pool total entre `--num-remates` salas independientes, en partes iguales.
Sirve para observar si el costo de tener N remates `LIVE` en paralelo escala
linealmente (RNF-06: la cantidad de remates simultáneos no debe estar acotada por
diseño).
"""

from __future__ import annotations

import argparse
import asyncio

from loadtest.client_http import wait_ready
from loadtest.config import RunConfig
from loadtest.fixtures import ensure_live_lotes
from loadtest.identity import ensure_identity_pool
from loadtest.metrics import MetricsCollector
from loadtest.scenarios._shared import ConnectSpec, close_all, connect_many_ramped, try_start_monitoring

NAME = "concurrent_remates"
DESCRIPTION = "Compradores repartidos entre múltiples remates LIVE simultáneos"


def add_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--num-remates", type=int, default=5, help="Remates simultáneos (default: 5)")
    parser.add_argument(
        "--buyers-per-remate", type=int, default=40, help="Compradores por remate (default: 40)"
    )
    parser.add_argument("--ramp-up-seconds", type=float, default=15.0)
    parser.add_argument("--hold-seconds", type=float, default=30.0)


async def run(config: RunConfig, args: argparse.Namespace) -> dict:
    await wait_ready(config.host)
    total_buyers = args.num_remates * args.buyers_per_remate
    pool = await ensure_identity_pool(config, total_buyers)
    live_lotes = await ensure_live_lotes(config, pool.auctioneer, args.num_remates)

    collector = MetricsCollector()
    poller = await try_start_monitoring(config, collector)

    specs: list[ConnectSpec] = []
    for i, buyer in enumerate(pool.buyers):
        live_lote = live_lotes[i % len(live_lotes)]
        specs.append(ConnectSpec(token=buyer.access_token, remate_id=live_lote.remate_id))

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
            "num_remates": args.num_remates,
            "buyers_per_remate": args.buyers_per_remate,
            "total_buyers": total_buyers,
            "ramp_up_seconds": args.ramp_up_seconds,
            "hold_seconds": args.hold_seconds,
            "connected_ok": len(clients),
        },
    )
