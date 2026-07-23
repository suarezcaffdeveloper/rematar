"""Recolección de métricas de una corrida: lo que el generador de carga observa
directamente (latencias, throughput, errores) y lo que el propio servidor reporta
mientras la corrida está en marcha (`GET /monitoring/metrics`, Épica 8, Módulo 8.1).

Ambas fuentes conviven en el mismo `RunResult` -- ver docs/39-pruebas-de-carga-y-rendimiento.md,
sección "de dónde sale cada métrica", para el porqué de tener ambas en vez de solo una.
"""

from __future__ import annotations

import asyncio
import statistics
import time
from dataclasses import dataclass
from typing import Any

import httpx


@dataclass
class LatencySample:
    timestamp: float
    elapsed_ms: float
    ok: bool


@dataclass
class MonitoringSample:
    timestamp: float
    connected_users: int
    active_websockets: int
    avg_oferta_processing_ms: float | None
    avg_api_response_ms: float | None
    errors_last_minute: int
    memory_usage_mb: float | None
    cpu_usage_percent: float | None


def percentile(values: list[float], pct: float) -> float:
    """Percentil por interpolación lineal sobre valores ordenados -- suficiente para un
    reporte de carga (no se necesita un algoritmo de streaming/aproximado: las corridas
    de este proyecto están acotadas a, como mucho, unas pocas decenas de miles de
    muestras, que entran cómodas en memoria)."""
    if not values:
        return 0.0
    ordered = sorted(values)
    if len(ordered) == 1:
        return ordered[0]
    rank = (pct / 100) * (len(ordered) - 1)
    lower = int(rank)
    upper = min(lower + 1, len(ordered) - 1)
    fraction = rank - lower
    return ordered[lower] + (ordered[upper] - ordered[lower]) * fraction


def summarize_latencies(samples: list[LatencySample]) -> dict[str, float | int]:
    values = [s.elapsed_ms for s in samples]
    ok_count = sum(1 for s in samples if s.ok)
    error_count = len(samples) - ok_count
    if not values:
        return {
            "count": 0,
            "ok_count": 0,
            "error_count": 0,
            "avg_ms": 0.0,
            "p50_ms": 0.0,
            "p95_ms": 0.0,
            "p99_ms": 0.0,
            "max_ms": 0.0,
        }
    return {
        "count": len(values),
        "ok_count": ok_count,
        "error_count": error_count,
        "avg_ms": statistics.mean(values),
        "p50_ms": percentile(values, 50),
        "p95_ms": percentile(values, 95),
        "p99_ms": percentile(values, 99),
        "max_ms": max(values),
    }


def latency_series(samples: list[LatencySample]) -> list[list[float]]:
    """`[[timestamp, elapsed_ms], ...]` -- la serie cruda detrás de `summarize_latencies`,
    para graficar latencia en el tiempo (no solo el agregado)."""
    return [[s.timestamp, s.elapsed_ms] for s in samples]


def bucket_per_second(timestamps: list[float]) -> list[tuple[int, int]]:
    """Cuenta eventos por segundo (epoch truncado), como pares (segundo, cantidad)
    ordenados -- la serie temporal de "requests/segundo", "ofertas/segundo", etc."""
    if not timestamps:
        return []
    counts: dict[int, int] = {}
    for ts in timestamps:
        bucket = int(ts)
        counts[bucket] = counts.get(bucket, 0) + 1
    return sorted(counts.items())


class MetricsCollector:
    """Un `MetricsCollector` por corrida de escenario -- no es thread-safe (no hace
    falta: todo el escenario corre en un único event loop de asyncio, y las mutaciones
    de `list.append` entre puntos de `await` son atómicas, mismo criterio que
    `ConnectionManager` del backend, docs/20-gateway-websocket.md)."""

    def __init__(self) -> None:
        self.http_samples: list[LatencySample] = []
        self.http_samples_by_label: dict[str, list[LatencySample]] = {}
        self.ws_connect_samples: list[LatencySample] = []
        self.ws_messages_received_at: list[float] = []
        self.ws_messages_sent_at: list[float] = []
        self.broadcast_latency_samples: list[LatencySample] = []
        self.errors: list[str] = []
        self.monitoring_samples: list[MonitoringSample] = []
        self.started_at = time.time()
        self.finished_at: float | None = None

    def record_http(self, label: str, elapsed_ms: float, status_code: int, timestamp: float) -> None:
        sample = LatencySample(timestamp=timestamp, elapsed_ms=elapsed_ms, ok=status_code < 400)
        self.http_samples.append(sample)
        self.http_samples_by_label.setdefault(label, []).append(sample)
        if not sample.ok:
            self.errors.append(f"{label} -> HTTP {status_code}")

    def record_ws_connect(self, elapsed_ms: float, *, ok: bool) -> None:
        self.ws_connect_samples.append(
            LatencySample(timestamp=time.time(), elapsed_ms=elapsed_ms, ok=ok)
        )

    def record_ws_message_received(self, timestamp: float) -> None:
        self.ws_messages_received_at.append(timestamp)

    def record_ws_message_sent(self, timestamp: float) -> None:
        self.ws_messages_sent_at.append(timestamp)

    def record_broadcast_latency(self, elapsed_ms: float) -> None:
        self.broadcast_latency_samples.append(
            LatencySample(timestamp=time.time(), elapsed_ms=elapsed_ms, ok=True)
        )

    def record_error(self, message: str) -> None:
        self.errors.append(message)

    def record_monitoring_sample(self, sample: MonitoringSample) -> None:
        self.monitoring_samples.append(sample)

    def finish(self) -> None:
        self.finished_at = time.time()

    @property
    def duration_seconds(self) -> float:
        end = self.finished_at or time.time()
        return max(end - self.started_at, 0.0001)

    def to_summary(
        self, *, scenario: str, config: dict[str, Any], extra: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        duration = self.duration_seconds
        ofertas_samples = self.http_samples_by_label.get("place_bid", [])
        chat_samples = self.http_samples_by_label.get("send_chat_message", [])
        summary = {
            "scenario": scenario,
            "config": config,
            "started_at": self.started_at,
            "finished_at": self.finished_at or time.time(),
            "duration_seconds": duration,
            "http": {
                "overall": summarize_latencies(self.http_samples),
                "by_label": {
                    label: summarize_latencies(samples)
                    for label, samples in self.http_samples_by_label.items()
                },
                "requests_per_second": len(self.http_samples) / duration,
                "timeseries_per_second": bucket_per_second([s.timestamp for s in self.http_samples]),
            },
            "websocket": {
                "connect": summarize_latencies(self.ws_connect_samples),
                "messages_received": len(self.ws_messages_received_at),
                "messages_sent": len(self.ws_messages_sent_at),
                "messages_per_second": (
                    len(self.ws_messages_received_at) + len(self.ws_messages_sent_at)
                )
                / duration,
                "timeseries_per_second": bucket_per_second(
                    self.ws_messages_received_at + self.ws_messages_sent_at
                ),
            },
            "ofertas": {
                "processed_per_second": len(ofertas_samples) / duration,
                "client_perceived": summarize_latencies(ofertas_samples),
                "series": latency_series(ofertas_samples),
            },
            "chat": {
                "sent_per_second": len(chat_samples) / duration,
                "client_perceived": summarize_latencies(chat_samples),
                "series": latency_series(chat_samples),
            },
            "broadcast": {
                "client_perceived": summarize_latencies(self.broadcast_latency_samples),
                "series": latency_series(self.broadcast_latency_samples),
            },
            "server_metrics": {
                "samples": [
                    {
                        "timestamp": s.timestamp,
                        "connected_users": s.connected_users,
                        "active_websockets": s.active_websockets,
                        "avg_oferta_processing_ms": s.avg_oferta_processing_ms,
                        "avg_api_response_ms": s.avg_api_response_ms,
                        "errors_last_minute": s.errors_last_minute,
                        "memory_usage_mb": s.memory_usage_mb,
                        "cpu_usage_percent": s.cpu_usage_percent,
                    }
                    for s in self.monitoring_samples
                ],
            },
            "errors": {
                "count": len(self.errors),
                "sample": self.errors[:50],
            },
        }
        if extra:
            summary["extra"] = extra
        return summary


class MonitoringPoller:
    """Sondea `GET /monitoring/metrics` (admin-only, Módulo 8.1) cada
    `poll_interval_seconds` mientras un escenario corre, y vuelca cada lectura en el
    `MetricsCollector` -- la serie temporal de CPU/memoria/conectados/timings del
    servidor que el reporte grafica junto a lo que el cliente midió.

    Usa su propio cliente HTTP crudo (no el `HttpClient` del escenario): el polling de
    monitoreo es tráfico del generador de carga sobre sí mismo, no carga generada --
    mezclarlo con `requests_per_second` del escenario inflaría esa métrica con llamadas
    que no forman parte del experimento."""

    def __init__(
        self,
        base_url: str,
        collector: MetricsCollector,
        *,
        admin_token: str,
        poll_interval_seconds: float = 2.0,
    ) -> None:
        self._client = httpx.AsyncClient(base_url=base_url, timeout=10.0)
        self._collector = collector
        self._admin_token = admin_token
        self._poll_interval_seconds = poll_interval_seconds
        self._task: asyncio.Task[None] | None = None
        self._stop = asyncio.Event()

    def start(self) -> None:
        self._task = asyncio.create_task(self._run())

    async def _run(self) -> None:
        headers = {"Authorization": f"Bearer {self._admin_token}"}
        while not self._stop.is_set():
            try:
                response = await self._client.get("/monitoring/metrics", headers=headers)
                if response.status_code == 200:
                    data = response.json()
                    self._collector.record_monitoring_sample(
                        MonitoringSample(
                            timestamp=time.time(),
                            connected_users=data["connected_users"],
                            active_websockets=data["active_websockets"],
                            avg_oferta_processing_ms=data["avg_oferta_processing_ms"],
                            avg_api_response_ms=data["avg_api_response_ms"],
                            errors_last_minute=data["errors_last_minute"],
                            memory_usage_mb=data["memory_usage_mb"],
                            cpu_usage_percent=data["cpu_usage_percent"],
                        )
                    )
            except Exception as exc:  # noqa: BLE001 -- el polling nunca debe tumbar el escenario
                self._collector.record_error(f"monitoring_poll_failed: {exc!r}")
            try:
                await asyncio.wait_for(self._stop.wait(), timeout=self._poll_interval_seconds)
            except TimeoutError:
                pass

    async def stop(self) -> None:
        self._stop.set()
        if self._task is not None:
            await self._task
        await self._client.aclose()
