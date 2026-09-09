"""Escenario: miles de ofertas consecutivas sobre un único lote abierto -- el stress
test más directo del Auction Engine (`SELECT FOR UPDATE`, ADR-004): muchos compradores
ofertando en paralelo, la mayoría de las ofertas deberían **rechazarse** (solo una puede
ser la vigente en cada instante) y eso es exactamente lo correcto, no un error del
sistema. Mide tiempo de procesamiento de una oferta (percibido por el cliente, ver
`avg_oferta_processing_ms` del servidor en el mismo reporte) y ofertas procesadas por
segundo.

`POST .../ofertas` siempre responde `201` -- el resultado (aceptada/rechazada) viene en
el cuerpo (`status`), no en el código HTTP (ver `backend/app/modules/ofertas/router.py`).
Por eso este escenario cuenta aceptadas/rechazadas leyendo el cuerpo, no el status code.
"""

from __future__ import annotations

import argparse
import asyncio
import itertools
import time
from decimal import Decimal

import sys

import httpx

from loadtest.client_http import HttpClient, wait_ready
from loadtest.config import RunConfig
from loadtest.fixtures import ensure_live_lote
from loadtest.identity import ensure_identity_pool, get_admin_identity
from loadtest.integrity import check_bid_integrity
from loadtest.metrics import MetricsCollector
from loadtest.scenarios._shared import try_start_monitoring

NAME = "bid_storm"
DESCRIPTION = "Miles de ofertas consecutivas sobre un único lote (stress del Auction Engine)"

BASE_PRICE = Decimal("100.00")
INCREMENT = Decimal("1.00")


def add_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--num-buyers", type=int, default=200, help="Compradores ofertando (default: 200)")
    parser.add_argument("--duration-seconds", type=float, default=20.0, help="Duración de la ráfaga")
    parser.add_argument(
        "--think-time-ms", type=float, default=200.0, help="Pausa entre ofertas de un mismo comprador"
    )


async def run(config: RunConfig, args: argparse.Namespace) -> dict:
    await wait_ready(config.host)
    pool = await ensure_identity_pool(config, args.num_buyers)
    live_lote = await ensure_live_lote(config, pool.auctioneer)

    collector = MetricsCollector()
    poller = await try_start_monitoring(config, collector)

    amount_counter = itertools.count(1)
    accepted = 0
    rejected = 0
    stop_at = time.monotonic() + args.duration_seconds
    path = f"/remates/{live_lote.remate_id}/lotes/{live_lote.lote_id}/ofertas"

    async with HttpClient(config.api_base_url, on_sample=collector.record_http) as client:

        async def bidder(token: str) -> None:
            nonlocal accepted, rejected
            headers = {"Authorization": f"Bearer {token}"}
            while time.monotonic() < stop_at:
                amount = BASE_PRICE + INCREMENT * next(amount_counter)
                try:
                    response = await client.post(
                        path, json={"amount": str(amount)}, headers=headers, label="place_bid"
                    )
                except httpx.HTTPError as exc:
                    # Un backend lento/caído bajo esta carga es exactamente lo que el
                    # escenario mide -- se registra como dato de la corrida, no se
                    # aborta el generador de carga por eso.
                    collector.record_error(f"place_bid -> {exc!r}")
                else:
                    if response.status_code == 201:
                        if response.json().get("status") == "accepted":
                            accepted += 1
                        else:
                            rejected += 1
                    else:
                        collector.record_error(f"place_bid -> HTTP {response.status_code}")
                if args.think_time_ms > 0:
                    await asyncio.sleep(args.think_time_ms / 1000)

        await asyncio.gather(*(bidder(buyer.access_token) for buyer in pool.buyers))

    if poller is not None:
        await poller.stop()
    collector.finish()

    # Fase 6 del plan de pruebas de carga: "no te limites a comprobar HTTP 200 --
    # verificá la integridad de los datos". Reusa el admin ya bootstrapeado (mismo
    # criterio best-effort que try_start_monitoring): si el login falla, la corrida
    # completa igual, solo sin esta sección del reporte.
    integrity_dict: dict | None = None
    try:
        admin = await get_admin_identity(config)
        report = await check_bid_integrity(
            config,
            admin_token=admin.access_token,
            remate_id=live_lote.remate_id,
            lote_id=live_lote.lote_id,
            base_price=BASE_PRICE,
            min_increment=INCREMENT,
            expected_total=accepted + rejected,
        )
        integrity_dict = report.to_dict()
        _print_integrity_report(report)
    except Exception as exc:  # noqa: BLE001 -- la verificación no debe tumbar la corrida
        print(
            f"[loadtest] aviso: no se pudo verificar integridad de datos ({exc!r}).",
            file=sys.stderr,
        )

    extra = {"ofertas_accepted": accepted, "ofertas_rejected": rejected}
    if integrity_dict is not None:
        extra["integrity"] = integrity_dict

    return collector.to_summary(
        scenario=NAME,
        config={
            "num_buyers": args.num_buyers,
            "duration_seconds": args.duration_seconds,
            "think_time_ms": args.think_time_ms,
        },
        extra=extra,
    )


def _print_integrity_report(report) -> None:  # type: ignore[no-untyped-def]
    header = "INTEGRIDAD DE DATOS: OK" if report.passed else "INTEGRIDAD DE DATOS: FALLÓ"
    print(f"\n{'=' * len(header)}\n{header}\n{'=' * len(header)}")
    print(
        f"  ofertas persistidas: {report.total_ofertas} "
        f"(accepted={report.accepted_count} rejected={report.rejected_count} outbid={report.outbid_count})"
    )
    print(f"  ganador vigente: {report.winner_amount} (leading endpoint: {report.leading_amount})")
    if report.issues:
        print("  problemas encontrados:")
        for issue in report.issues:
            print(f"    - {issue}")
    print()
