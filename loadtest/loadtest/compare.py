"""Compara N `summary.json` de corridas distintas -- un `comparison.html` con una
tabla lado a lado y gráficos de barras de las métricas clave, para responder "¿cómo
escaló el sistema entre 100, 500 y 1000 compradores?" sin tener que leer N reportes
individuales por separado.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import matplotlib.pyplot as plt

from loadtest.charting import fig_to_base64, jinja_env


def load_summaries(paths: list[Path]) -> list[dict[str, Any]]:
    summaries = []
    for path in paths:
        summaries.append(json.loads(path.read_text(encoding="utf-8")))
    return summaries


def _label_for(summary: dict[str, Any]) -> str:
    config = summary.get("config", {})
    size_hint = (
        config.get("num_buyers")
        or config.get("total_buyers")
        or config.get("connected_ok")
        or ""
    )
    return f"{summary['scenario']} ({size_hint})" if size_hint != "" else summary["scenario"]


def _bar_chart(labels: list[str], values: list[float], title: str, ylabel: str, color: str) -> str:
    fig, ax = plt.subplots(figsize=(8, 3.4))
    ax.bar(labels, values, color=color)
    ax.set_ylabel(ylabel)
    ax.set_title(title)
    ax.tick_params(axis="x", rotation=20)
    ax.grid(True, axis="y", alpha=0.3)
    return fig_to_base64(fig)


def build_comparison(summaries: list[dict[str, Any]]) -> dict[str, Any]:
    labels = [_label_for(s) for s in summaries]

    bid_p95 = [s["ofertas"]["client_perceived"]["p95_ms"] for s in summaries]
    broadcast_p95 = [s["broadcast"]["client_perceived"]["p95_ms"] for s in summaries]
    requests_per_second = [s["http"]["requests_per_second"] for s in summaries]
    ws_messages_per_second = [s["websocket"]["messages_per_second"] for s in summaries]
    error_counts = [s["errors"]["count"] for s in summaries]

    charts = {
        "bid_p95": _bar_chart(labels, bid_p95, "Latencia p95 de oferta por escenario", "ms", "#c0392b"),
        "broadcast_p95": _bar_chart(
            labels, broadcast_p95, "Latencia p95 de difusión por escenario (RNF-01)", "ms", "#8e44ad"
        ),
        "requests_per_second": _bar_chart(
            labels, requests_per_second, "Requests/segundo por escenario", "req/s", "#2980b9"
        ),
        "ws_messages_per_second": _bar_chart(
            labels, ws_messages_per_second, "Mensajes WS/segundo por escenario", "msg/s", "#16a085"
        ),
        "error_counts": _bar_chart(labels, error_counts, "Errores detectados por escenario", "errores", "#d35400"),
    }

    rows = []
    for summary in summaries:
        rows.append(
            {
                "label": _label_for(summary),
                "duration_seconds": summary["duration_seconds"],
                "requests_per_second": summary["http"]["requests_per_second"],
                "ws_messages_per_second": summary["websocket"]["messages_per_second"],
                "ofertas_p95_ms": summary["ofertas"]["client_perceived"]["p95_ms"],
                "broadcast_p95_ms": summary["broadcast"]["client_perceived"]["p95_ms"],
                "errors": summary["errors"]["count"],
            }
        )

    return {"rows": rows, "charts": charts}


def write_comparison_report(summaries: list[dict[str, Any]], output_dir: Path) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    comparison = build_comparison(summaries)
    env = jinja_env()
    template = env.get_template("comparison.html.j2")
    html = template.render(
        rows=comparison["rows"],
        charts=comparison["charts"],
        generated_at=datetime.now(timezone.utc).isoformat(),
    )
    path = output_dir / "comparison.html"
    path.write_text(html, encoding="utf-8")
    return path
