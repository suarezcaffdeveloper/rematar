"""Tests del motor de recomendaciones (`loadtest/report.py`) -- reglas fijas contra los
umbrales de docs/04-requisitos-no-funcionales.md. No ejercitan los gráficos
(matplotlib) ni el HTML en sí: eso se verifica visualmente abriendo un reporte real
generado contra un backend corriendo (ver README)."""

from __future__ import annotations

from typing import Any

from loadtest.report import build_recommendations

EMPTY_LATENCY_STATS = {
    "count": 0,
    "ok_count": 0,
    "error_count": 0,
    "avg_ms": 0.0,
    "p50_ms": 0.0,
    "p95_ms": 0.0,
    "p99_ms": 0.0,
    "max_ms": 0.0,
}


def _base_summary(**overrides: Any) -> dict[str, Any]:
    summary: dict[str, Any] = {
        "scenario": "test_scenario",
        "config": {"num_buyers": 100, "connected_ok": 100},
        "ofertas": {"client_perceived": dict(EMPTY_LATENCY_STATS)},
        "broadcast": {"client_perceived": dict(EMPTY_LATENCY_STATS)},
        "http": {"overall": {**EMPTY_LATENCY_STATS, "count": 100}},
        "errors": {"count": 0, "sample": []},
        "server_metrics": {"samples": []},
    }
    summary.update(overrides)
    return summary


def test_clean_run_reports_no_issues() -> None:
    recommendations = build_recommendations(_base_summary())
    assert len(recommendations) == 1
    assert "dentro de lo esperado" in recommendations[0]


def test_flags_slow_bid_roundtrip_against_rnf02() -> None:
    summary = _base_summary(
        ofertas={"client_perceived": {**EMPTY_LATENCY_STATS, "count": 50, "p95_ms": 400.0}}
    )
    recommendations = build_recommendations(summary)
    assert any("RNF-02" in r for r in recommendations)


def test_flags_slow_broadcast_against_rnf01() -> None:
    summary = _base_summary(
        broadcast={"client_perceived": {**EMPTY_LATENCY_STATS, "count": 200, "p95_ms": 500.0}}
    )
    recommendations = build_recommendations(summary)
    assert any("RNF-01" in r for r in recommendations)


def test_flags_sustained_high_cpu() -> None:
    samples = [
        {"cpu_usage_percent": 95.0, "memory_usage_mb": 100.0, "connected_users": 10}
        for _ in range(10)
    ]
    summary = _base_summary(server_metrics={"samples": samples})
    recommendations = build_recommendations(summary)
    assert any("CPU" in r for r in recommendations)


def test_flags_monotonic_memory_growth() -> None:
    samples = [
        {"cpu_usage_percent": 10.0, "memory_usage_mb": mb, "connected_users": 10}
        for mb in [100.0, 100.0, 100.0, 100.0, 300.0, 300.0, 300.0, 300.0]
    ]
    summary = _base_summary(server_metrics={"samples": samples})
    recommendations = build_recommendations(summary)
    assert any("fuga de memoria" in r for r in recommendations)


def test_flags_high_error_rate() -> None:
    summary = _base_summary(
        http={"overall": {**EMPTY_LATENCY_STATS, "count": 100}},
        errors={"count": 10, "sample": []},
    )
    recommendations = build_recommendations(summary)
    assert any("Tasa de error" in r for r in recommendations)


def test_flags_websocket_connection_failures() -> None:
    summary = _base_summary(config={"num_buyers": 1000, "connected_ok": 900})
    recommendations = build_recommendations(summary)
    assert any("conexiones WebSocket no se establecieron" in r for r in recommendations)
