"""Escenario: mide la latencia de difusión de un evento de dominio a todos los
clientes conectados a la sala de un remate -- valida directamente RNF-01 ("difusión de
una oferta aceptada a todos los clientes conectados... en menos de 300ms p95 bajo
carga nominal", `docs/04-requisitos-no-funcionales.md`).

Un comprador designado ("prober", el primero del pool) ofertas en rondas con montos
crecientes -- cada oferta aceptada dispara `OfertaAccepted` (`event_type:
"oferta.accepted"`), que el pipeline de sincronización en tiempo real (Épica 3.5)
reenvía a todos los conectados a la sala. `DomainEventMessage.occurred_at`
(`app/realtime/messages.py`) es el timestamp del servidor al publicar el evento; cada
cliente conectado resta ese timestamp del momento en que lo recibió -- esa diferencia
es la latencia de difusión medida punto a punto (servidor -> N clientes), no solo el
tiempo de ida y vuelta de quien ofertó.
"""

from __future__ import annotations

import argparse
import asyncio
import time
from datetime import datetime, timezone
from decimal import Decimal

import httpx

from loadtest.client_http import HttpClient, wait_ready
from loadtest.config import RunConfig
from loadtest.fixtures import ensure_live_lote
from loadtest.identity import ensure_identity_pool
from loadtest.metrics import MetricsCollector
from loadtest.scenarios._shared import ConnectSpec, close_all, connect_many_ramped, try_start_monitoring

NAME = "notifications_broadcast"
DESCRIPTION = "Latencia de difusión de un evento de dominio a N clientes conectados (RNF-01)"

BASE_PRICE = Decimal("100.00")
INCREMENT = Decimal("5.00")


def add_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--num-buyers", type=int, default=200, help="Compradores conectados (default: 200)")
    parser.add_argument("--ramp-up-seconds", type=float, default=10.0)
    parser.add_argument("--num-rounds", type=int, default=30, help="Cuántas ofertas aceptadas disparar")
    parser.add_argument(
        "--round-interval-seconds",
        type=float,
        default=1.0,
        help="Pausa entre rondas -- deja tiempo a que el broadcast anterior llegue a todos",
    )


async def run(config: RunConfig, args: argparse.Namespace) -> dict:
    await wait_ready(config.host)
    pool = await ensure_identity_pool(config, args.num_buyers)
    live_lote = await ensure_live_lote(config, pool.auctioneer)

    collector = MetricsCollector()

    def on_domain_event(message: dict, receive_time: float) -> None:
        if message.get("event_type") != "oferta.accepted":
            return
        occurred_at = datetime.fromisoformat(message["occurred_at"])
        if occurred_at.tzinfo is None:
            occurred_at = occurred_at.replace(tzinfo=timezone.utc)
        latency_ms = (receive_time - occurred_at.timestamp()) * 1000
        collector.record_broadcast_latency(latency_ms)

    poller = await try_start_monitoring(config, collector)

    specs = [
        ConnectSpec(token=buyer.access_token, remate_id=live_lote.remate_id, on_domain_event=on_domain_event)
        for buyer in pool.buyers
    ]
    clients = await connect_many_ramped(config.ws_url, specs, collector, ramp_up_seconds=args.ramp_up_seconds)
    await asyncio.sleep(1.0)  # margen para que todos terminen join_room antes de la primera ronda

    prober = pool.buyers[0]
    path = f"/remates/{live_lote.remate_id}/lotes/{live_lote.lote_id}/ofertas"
    accepted_rounds = 0

    try:
        async with HttpClient(config.api_base_url, on_sample=collector.record_http) as client:
            headers = {"Authorization": f"Bearer {prober.access_token}"}
            for round_index in range(1, args.num_rounds + 1):
                amount = BASE_PRICE + INCREMENT * round_index
                try:
                    response = await client.post(
                        path, json={"amount": str(amount)}, headers=headers, label="place_bid"
                    )
                except httpx.HTTPError as exc:
                    collector.record_error(f"prober_bid_failed -> {exc!r}")
                else:
                    if response.status_code == 201 and response.json().get("status") == "accepted":
                        accepted_rounds += 1
                    else:
                        collector.record_error(f"prober_bid_not_accepted -> {response.status_code}")
                await asyncio.sleep(args.round_interval_seconds)

        await asyncio.sleep(2.0)  # margen para que el último broadcast termine de llegar
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
            "num_rounds": args.num_rounds,
            "round_interval_seconds": args.round_interval_seconds,
            "connected_ok": len(clients),
        },
        extra={"accepted_rounds": accepted_rounds},
    )
