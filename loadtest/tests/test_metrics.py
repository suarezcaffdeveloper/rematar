"""Tests de la lógica pura de `loadtest/metrics.py` -- percentiles, agregación de
latencias y bucketing por segundo. No requieren un backend corriendo (a diferencia de
los escenarios en sí, que son la verificación end-to-end real, ver
docs/39-pruebas-de-carga-y-rendimiento.md)."""

from loadtest.metrics import (
    LatencySample,
    bucket_per_second,
    latency_series,
    percentile,
    summarize_latencies,
)


def test_percentile_empty_list_returns_zero() -> None:
    assert percentile([], 95) == 0.0


def test_percentile_single_value() -> None:
    assert percentile([42.0], 95) == 42.0


def test_percentile_matches_known_values() -> None:
    values = [1.0, 2.0, 3.0, 4.0, 5.0]
    assert percentile(values, 50) == 3.0
    assert percentile(values, 0) == 1.0
    assert percentile(values, 100) == 5.0


def test_summarize_latencies_empty() -> None:
    stats = summarize_latencies([])
    assert stats["count"] == 0
    assert stats["avg_ms"] == 0.0
    assert stats["p95_ms"] == 0.0


def test_summarize_latencies_counts_ok_and_errors() -> None:
    samples = [
        LatencySample(timestamp=1.0, elapsed_ms=100.0, ok=True),
        LatencySample(timestamp=2.0, elapsed_ms=200.0, ok=True),
        LatencySample(timestamp=3.0, elapsed_ms=50.0, ok=False),
    ]
    stats = summarize_latencies(samples)
    assert stats["count"] == 3
    assert stats["ok_count"] == 2
    assert stats["error_count"] == 1
    assert stats["max_ms"] == 200.0
    assert stats["avg_ms"] == (100.0 + 200.0 + 50.0) / 3


def test_bucket_per_second_groups_by_truncated_epoch() -> None:
    buckets = bucket_per_second([10.1, 10.5, 10.9, 11.2, 11.8])
    assert buckets == [(10, 3), (11, 2)]


def test_bucket_per_second_empty() -> None:
    assert bucket_per_second([]) == []


def test_latency_series_roundtrip() -> None:
    samples = [LatencySample(timestamp=1.5, elapsed_ms=10.0, ok=True)]
    assert latency_series(samples) == [[1.5, 10.0]]
