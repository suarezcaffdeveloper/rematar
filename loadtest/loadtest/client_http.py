"""Wrapper fino sobre `httpx.AsyncClient` que mide cada llamada. No agrega reintentos,
retries ni ninguna lógica de negocio -- un escenario que necesite eso lo hace explícito
él mismo, para que las métricas reflejen el comportamiento real del sistema, no una
resiliencia inventada por el generador de carga.
"""

from __future__ import annotations

import asyncio
import time
from collections.abc import Callable
from typing import Any

import httpx

SampleRecorder = Callable[[str, float, int, float], None]
"""`(label, elapsed_ms, status_code, timestamp) -> None` -- ver `MetricsCollector.record_http`."""


class HttpClient:
    def __init__(
        self,
        base_url: str,
        *,
        timeout: float = 30.0,
        on_sample: SampleRecorder | None = None,
    ) -> None:
        self._client = httpx.AsyncClient(base_url=base_url, timeout=timeout)
        self._on_sample = on_sample

    async def request(
        self,
        method: str,
        path: str,
        *,
        label: str | None = None,
        **kwargs: Any,
    ) -> httpx.Response:
        start = time.perf_counter()
        response = await self._client.request(method, path, **kwargs)
        elapsed_ms = (time.perf_counter() - start) * 1000
        if self._on_sample is not None:
            self._on_sample(label or f"{method.upper()} {path}", elapsed_ms, response.status_code, time.time())
        return response

    async def get(self, path: str, **kwargs: Any) -> httpx.Response:
        return await self.request("GET", path, **kwargs)

    async def post(self, path: str, **kwargs: Any) -> httpx.Response:
        return await self.request("POST", path, **kwargs)

    async def aclose(self) -> None:
        await self._client.aclose()

    async def __aenter__(self) -> "HttpClient":
        return self

    async def __aexit__(self, *exc_info: object) -> None:
        await self.aclose()


async def wait_ready(base_host: str, *, timeout: float = 30.0, poll_interval: float = 1.0) -> None:
    """Espera a que `GET {base_host}/health` responda 200 -- usado antes de sembrar
    datos para no fallar por una carrera contra un backend que recién está arrancando
    (ej. justo después de `docker compose up`)."""
    deadline = time.monotonic() + timeout
    last_error: Exception | None = None
    async with httpx.AsyncClient(base_url=base_host, timeout=5.0) as client:
        while time.monotonic() < deadline:
            try:
                response = await client.get("/health")
                if response.status_code == 200:
                    return
            except httpx.HTTPError as exc:
                last_error = exc
            await asyncio.sleep(poll_interval)
    raise TimeoutError(f"El backend en {base_host} no respondió /health a tiempo: {last_error}")
