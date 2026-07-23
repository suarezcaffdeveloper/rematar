"""`RunResult` (el `dict` que produce `MetricsCollector.to_summary`) -> `summary.json` +
`report.html`. El HTML es autocontenido (gráficos como PNG embebidos en base64 vía
matplotlib con backend `Agg`, sin CDN ni JS externo) -- se abre con `file://` directo,
sin servidor.

El motor de recomendaciones es deliberadamente básico (reglas fijas contra los
umbrales ya documentados en `docs/04-requisitos-no-funcionales.md`), no un análisis
estadístico -- ver docs/39-pruebas-de-carga-y-rendimiento.md, sección "recomendaciones".
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import matplotlib.pyplot as plt

from loadtest.charting import fig_to_base64, jinja_env

# Umbrales de docs/04-requisitos-no-funcionales.md y reglas operativas básicas.
BID_ROUNDTRIP_P95_MS_THRESHOLD = 150.0  # RNF-02
BROADCAST_P95_MS_THRESHOLD = 300.0  # RNF-01
TARGET_WS_CONNECTIONS = 2000  # RNF-04 (objetivo de diseño, no necesariamente el de esta corrida)
CPU_SUSTAINED_PERCENT_THRESHOLD = 80.0
MEMORY_GROWTH_MB_THRESHOLD = 50.0
ERROR_RATE_THRESHOLD = 0.02


def _relative_seconds(timestamps: list[float], start: float) -> list[float]:
    return [ts - start for ts in timestamps]


def _chart_latency_series(series: list[list[float]], start: float, title: str, color: str) -> str | None:
    if not series:
        return None
    xs = _relative_seconds([point[0] for point in series], start)
    ys = [point[1] for point in series]
    fig, ax = plt.subplots(figsize=(8, 3.2))
    ax.scatter(xs, ys, s=6, alpha=0.5, color=color)
    ax.set_xlabel("Segundos desde el inicio")
    ax.set_ylabel("Latencia (ms)")
    ax.set_title(title)
    ax.grid(True, alpha=0.3)
    return fig_to_base64(fig)


def _chart_throughput(timeseries: list[list[int]], start: float, title: str, color: str) -> str | None:
    if not timeseries:
        return None
    xs = [second - start for second, _ in timeseries]
    ys = [count for _, count in timeseries]
    fig, ax = plt.subplots(figsize=(8, 3.2))
    ax.plot(xs, ys, color=color, linewidth=1.5)
    ax.fill_between(xs, ys, alpha=0.2, color=color)
    ax.set_xlabel("Segundos desde el inicio")
    ax.set_ylabel("Eventos/segundo")
    ax.set_title(title)
    ax.grid(True, alpha=0.3)
    return fig_to_base64(fig)


def _chart_server_resources(samples: list[dict[str, Any]], start: float) -> str | None:
    usable = [s for s in samples if s["cpu_usage_percent"] is not None or s["memory_usage_mb"] is not None]
    if not usable:
        return None
    xs = _relative_seconds([s["timestamp"] for s in usable], start)
    fig, ax_cpu = plt.subplots(figsize=(8, 3.2))
    ax_mem = ax_cpu.twinx()
    cpu_values = [s["cpu_usage_percent"] for s in usable]
    mem_values = [s["memory_usage_mb"] for s in usable]
    ax_cpu.plot(xs, cpu_values, color="#c0392b", label="CPU %")
    ax_mem.plot(xs, mem_values, color="#2980b9", label="Memoria (MB)")
    ax_cpu.set_xlabel("Segundos desde el inicio")
    ax_cpu.set_ylabel("CPU %", color="#c0392b")
    ax_mem.set_ylabel("Memoria (MB)", color="#2980b9")
    ax_cpu.set_title("CPU y memoria del proceso del backend (GET /monitoring/metrics)")
    ax_cpu.grid(True, alpha=0.3)
    return fig_to_base64(fig)


def _chart_active_connections(samples: list[dict[str, Any]], start: float) -> str | None:
    usable = [s for s in samples if s["connected_users"] is not None]
    if not usable:
        return None
    xs = _relative_seconds([s["timestamp"] for s in usable], start)
    connected = [s["connected_users"] for s in usable]
    websockets = [s["active_websockets"] for s in usable]
    fig, ax = plt.subplots(figsize=(8, 3.2))
    ax.plot(xs, connected, label="Usuarios conectados (distintos)", color="#27ae60")
    ax.plot(xs, websockets, label="WebSockets activos (conexiones)", color="#8e44ad")
    ax.set_xlabel("Segundos desde el inicio")
    ax.set_ylabel("Cantidad")
    ax.set_title("Conexiones activas reportadas por el servidor")
    ax.legend(loc="best", fontsize=8)
    ax.grid(True, alpha=0.3)
    return fig_to_base64(fig)


def build_recommendations(summary: dict[str, Any]) -> list[str]:
    recommendations: list[str] = []

    bid_stats = summary["ofertas"]["client_perceived"]
    if bid_stats["count"] and bid_stats["p95_ms"] > BID_ROUNDTRIP_P95_MS_THRESHOLD:
        recommendations.append(
            f"La ida y vuelta de una oferta (p95={bid_stats['p95_ms']:.0f}ms) supera el "
            f"objetivo de RNF-02 ({BID_ROUNDTRIP_P95_MS_THRESHOLD:.0f}ms). Revisar contención "
            "del lock de fila en el Auction Engine (ADR-004) o el tamaño del pool de "
            "conexiones a Postgres antes de aumentar la carga."
        )

    broadcast_stats = summary["broadcast"]["client_perceived"]
    if broadcast_stats["count"] and broadcast_stats["p95_ms"] > BROADCAST_P95_MS_THRESHOLD:
        recommendations.append(
            f"La difusión de un evento a los clientes conectados (p95="
            f"{broadcast_stats['p95_ms']:.0f}ms) supera el objetivo de RNF-01 "
            f"({BROADCAST_P95_MS_THRESHOLD:.0f}ms). Revisar el throughput de Redis Pub/Sub "
            "y del Event Consumer (Épica 3, Módulo 3.5)."
        )

    server_samples = summary["server_metrics"]["samples"]
    cpu_values = [s["cpu_usage_percent"] for s in server_samples if s["cpu_usage_percent"] is not None]
    if cpu_values and (sum(v > CPU_SUSTAINED_PERCENT_THRESHOLD for v in cpu_values) / len(cpu_values)) > 0.5:
        recommendations.append(
            f"CPU del proceso del backend por encima de {CPU_SUSTAINED_PERCENT_THRESHOLD:.0f}% "
            "durante más de la mitad de la corrida. Considerar escalar horizontalmente "
            "(agregar instancias detrás de un balanceador, ver ADR-001) antes de que la "
            "latencia se degrade con más carga."
        )

    memory_values = [s["memory_usage_mb"] for s in server_samples if s["memory_usage_mb"] is not None]
    if len(memory_values) >= 4:
        quarter = max(1, len(memory_values) // 4)
        growth = (sum(memory_values[-quarter:]) / quarter) - (sum(memory_values[:quarter]) / quarter)
        if growth > MEMORY_GROWTH_MB_THRESHOLD:
            recommendations.append(
                f"La memoria del proceso creció ~{growth:.0f}MB entre el inicio y el final de "
                "la corrida sin estabilizarse. Podría ser una fuga de memoria bajo carga "
                "sostenida -- investigar antes de asumir que es tráfico normal."
            )

    total_requests = summary["http"]["overall"]["count"]
    error_count = summary["errors"]["count"]
    if total_requests and (error_count / total_requests) > ERROR_RATE_THRESHOLD:
        recommendations.append(
            f"Tasa de error de {error_count}/{total_requests} "
            f"({(error_count / total_requests) * 100:.1f}%) supera el "
            f"{ERROR_RATE_THRESHOLD * 100:.0f}% considerado aceptable. Revisar rate limiting, "
            "timeouts y el pool de conexiones antes de escalar la carga."
        )

    config = summary.get("config", {})
    connected_ok = config.get("connected_ok")
    num_buyers = config.get("num_buyers") or config.get("total_buyers")
    if connected_ok is not None and num_buyers:
        failure_rate = 1 - (connected_ok / num_buyers)
        if failure_rate > 0.01:
            recommendations.append(
                f"{num_buyers - connected_ok} de {num_buyers} conexiones WebSocket no se "
                f"establecieron ({failure_rate * 100:.1f}%). Si el objetivo es acercarse a las "
                f"{TARGET_WS_CONNECTIONS} conexiones de RNF-04, investigar la causa antes de "
                "aumentar más la carga."
            )

    if not recommendations:
        recommendations.append(
            "Ninguna métrica superó los umbrales de RNF-01/RNF-02/RNF-04 ni las reglas "
            "operativas básicas -- el sistema se comportó dentro de lo esperado para esta carga."
        )
    return recommendations


def write_summary_json(summary: dict[str, Any], output_dir: Path) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    path = output_dir / "summary.json"
    path.write_text(json.dumps(summary, indent=2, default=str), encoding="utf-8")
    return path


def write_html_report(summary: dict[str, Any], output_dir: Path) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    start = summary["started_at"]

    charts = {
        "ofertas_latency": _chart_latency_series(
            summary["ofertas"]["series"], start, "Latencia de ofertas (percibida por el cliente)", "#c0392b"
        ),
        "chat_latency": _chart_latency_series(
            summary["chat"]["series"], start, "Latencia de envío de chat (percibida por el cliente)", "#e67e22"
        ),
        "broadcast_latency": _chart_latency_series(
            summary["broadcast"]["series"], start, "Latencia de difusión de eventos (RNF-01)", "#8e44ad"
        ),
        "requests_per_second": _chart_throughput(
            summary["http"]["timeseries_per_second"], start, "Requests HTTP por segundo", "#2980b9"
        ),
        "ws_messages_per_second": _chart_throughput(
            summary["websocket"]["timeseries_per_second"], start, "Mensajes WebSocket por segundo", "#16a085"
        ),
        "server_resources": _chart_server_resources(summary["server_metrics"]["samples"], start),
        "active_connections": _chart_active_connections(summary["server_metrics"]["samples"], start),
    }

    recommendations = build_recommendations(summary)

    env = jinja_env()
    template = env.get_template("report.html.j2")
    html = template.render(
        summary=summary,
        charts=charts,
        recommendations=recommendations,
        generated_at=datetime.now(timezone.utc).isoformat(),
    )
    path = output_dir / "report.html"
    path.write_text(html, encoding="utf-8")
    return path


def generate_report(summary: dict[str, Any], output_dir: Path) -> tuple[Path, Path]:
    summary_path = write_summary_json(summary, output_dir)
    report_path = write_html_report(summary, output_dir)
    return summary_path, report_path
