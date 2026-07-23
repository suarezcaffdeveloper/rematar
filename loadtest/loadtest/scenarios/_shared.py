"""Utilidades compartidas entre escenarios: conectar N compradores por WebSocket con
ramp-up (evita un "thundering herd" de conexiones simultáneas que no representaría una
llegada realista de usuarios) y cerrarlos prolijamente al terminar.
"""

from __future__ import annotations

import asyncio
import sys
from dataclasses import dataclass

from loadtest.client_ws import DomainEventHandler, WsClient
from loadtest.config import RunConfig
from loadtest.identity import get_admin_identity
from loadtest.metrics import MetricsCollector, MonitoringPoller


@dataclass
class ConnectSpec:
    token: str
    remate_id: str | None
    on_domain_event: DomainEventHandler | None = None


async def connect_one(ws_url: str, spec: ConnectSpec, collector: MetricsCollector) -> WsClient | None:
    client = WsClient(ws_url, spec.token, on_domain_event=spec.on_domain_event)
    try:
        elapsed_ms = await client.connect()
    except Exception as exc:  # noqa: BLE001 -- cualquier falla de conexión es un dato de la corrida
        collector.record_ws_connect(0.0, ok=False)
        collector.record_error(f"ws_connect_failed: {exc!r}")
        return None
    collector.record_ws_connect(elapsed_ms, ok=True)

    if spec.remate_id is not None:
        try:
            await client.join_room(spec.remate_id)
        except Exception as exc:  # noqa: BLE001
            collector.record_error(f"join_room_failed: {exc!r}")
            await client.close()
            return None
    return client


async def connect_many_ramped(
    ws_url: str,
    specs: list[ConnectSpec],
    collector: MetricsCollector,
    *,
    ramp_up_seconds: float,
) -> list[WsClient]:
    """Distribuye las conexiones de forma pareja a lo largo de `ramp_up_seconds`
    (conexión `i` de `n` espera `(i/n) * ramp_up_seconds` antes de intentar) -- simula
    compradores llegando de a poco, no todos en el mismo instante."""
    total = len(specs)

    async def delayed(index: int, spec: ConnectSpec) -> WsClient | None:
        if ramp_up_seconds > 0 and total > 1:
            await asyncio.sleep((index / total) * ramp_up_seconds)
        return await connect_one(ws_url, spec, collector)

    results = await asyncio.gather(*(delayed(i, spec) for i, spec in enumerate(specs)))
    return [client for client in results if client is not None]


async def close_all(clients: list[WsClient]) -> None:
    await asyncio.gather(*(client.close() for client in clients), return_exceptions=True)


async def try_start_monitoring(config: RunConfig, collector: MetricsCollector) -> MonitoringPoller | None:
    """El sondeo de `GET /monitoring/metrics` (CPU/memoria/conectados del servidor) es
    un enriquecimiento del reporte, no el objetivo del escenario -- si el login de
    admin falla (credenciales desactualizadas, admin no bootstrapeado en este entorno),
    la corrida sigue igual, solo sin esa serie temporal de métricas de servidor. Mismo
    criterio best-effort que `MonitoringPoller` ya aplica a cada poll individual."""
    try:
        admin = await get_admin_identity(config)
    except Exception as exc:  # noqa: BLE001 -- credenciales de admin ausentes/incorrectas no deben abortar la corrida
        print(
            f"[loadtest] aviso: no se pudo autenticar como admin ({exc!r}) -- "
            "el reporte no incluirá métricas de servidor (CPU/memoria/conectados).",
            file=sys.stderr,
        )
        return None
    poller = MonitoringPoller(
        config.api_base_url,
        collector,
        admin_token=admin.access_token,
        poll_interval_seconds=config.monitoring_poll_interval_seconds,
    )
    poller.start()
    return poller
