"""Cliente WebSocket que habla el protocolo propio del Gateway
(`backend/app/websocket/messages.py`, docs/20-gateway-websocket.md) tal como lo hablaría
un navegador real: acepta la conexión, autentica en el primer mensaje, responde al
heartbeat aplicativo (`ping`/`pong`), y opcionalmente se une a la sala de un remate.

No importa nada de `backend/app` -- reimplementa el protocolo desde la documentación
pública, exactamente como lo haría cualquier cliente externo real. Esa reimplementación
independiente es, de hecho, la prueba más honesta de que el protocolo documentado
funciona: si este cliente tuviera que copiar código del backend para funcionar, el
protocolo no estaría realmente desacoplado del transporte.
"""

from __future__ import annotations

import asyncio
import json
import time
import uuid
from collections.abc import Awaitable, Callable
from typing import Any

import websockets
from websockets.asyncio.client import ClientConnection

DomainEventHandler = Callable[[dict[str, Any], float], Awaitable[None] | None]


class WsClientError(RuntimeError):
    """La conexión, autenticación o unión a sala falló."""


class WsClient:
    """Una conexión WebSocket simulando un comprador conectado. `connect()` deja la
    conexión autenticada y con un `recv_loop` corriendo en background; `join_room` es
    opcional (algunos escenarios solo miden capacidad de conexión, sin sala)."""

    def __init__(
        self,
        ws_url: str,
        token: str,
        *,
        on_domain_event: DomainEventHandler | None = None,
        connect_timeout: float = 10.0,
    ) -> None:
        self._ws_url = ws_url
        self._token = token
        self._on_domain_event = on_domain_event
        self._connect_timeout = connect_timeout
        self._connection: ClientConnection | None = None
        self._recv_task: asyncio.Task[None] | None = None
        self._pending_room_join: asyncio.Future[dict[str, Any]] | None = None
        self.messages_received = 0
        self.messages_sent = 0
        self.errors: list[str] = []

    async def connect(self) -> float:
        """Abre la conexión, autentica, y arranca el loop de recepción. Devuelve el
        tiempo total (ms) desde que se abre el socket hasta recibir `connected`."""
        start = time.perf_counter()
        self._connection = await asyncio.wait_for(
            websockets.connect(self._ws_url), timeout=self._connect_timeout
        )
        await self._send({"schema_version": 1, "type": "auth", "token": self._token})
        raw = await asyncio.wait_for(self._connection.recv(), timeout=self._connect_timeout)
        self.messages_received += 1
        message = json.loads(raw)
        if message.get("type") != "connected":
            await self._connection.close()
            raise WsClientError(f"Autenticación rechazada: {message}")
        elapsed_ms = (time.perf_counter() - start) * 1000
        self._recv_task = asyncio.create_task(self._recv_loop())
        return elapsed_ms

    async def join_room(self, remate_id: uuid.UUID | str) -> float:
        if self._connection is None:
            raise WsClientError("join_room llamado antes de connect()")
        start = time.perf_counter()
        response_future: asyncio.Future[dict[str, Any]] = asyncio.get_running_loop().create_future()
        self._pending_room_join = response_future
        await self._send(
            {"schema_version": 1, "type": "join_room", "remate_id": str(remate_id)}
        )
        try:
            message = await asyncio.wait_for(response_future, timeout=self._connect_timeout)
        finally:
            self._pending_room_join = None
        if message.get("type") != "room_joined":
            raise WsClientError(f"join_room rechazado: {message}")
        return (time.perf_counter() - start) * 1000

    async def _send(self, payload: dict[str, Any]) -> None:
        assert self._connection is not None
        await self._connection.send(json.dumps(payload))
        self.messages_sent += 1

    async def _recv_loop(self) -> None:
        assert self._connection is not None
        try:
            async for raw in self._connection:
                receive_time = time.time()
                self.messages_received += 1
                try:
                    message = json.loads(raw)
                except json.JSONDecodeError:
                    self.errors.append(f"mensaje no-JSON recibido: {raw!r}")
                    continue
                await self._dispatch(message, receive_time)
        except websockets.ConnectionClosedOK:
            pass
        except websockets.ConnectionClosedError as exc:
            self.errors.append(f"conexión cerrada inesperadamente: {exc}")
        except Exception as exc:  # noqa: BLE001 -- cualquier falla de red cuenta como error de la corrida
            self.errors.append(f"error en recv_loop: {exc!r}")

    async def _dispatch(self, message: dict[str, Any], receive_time: float) -> None:
        message_type = message.get("type")
        if message_type == "ping":
            await self._send({"schema_version": 1, "type": "pong"})
            return
        if message_type == "room_joined" and self._pending_room_join is not None:
            if not self._pending_room_join.done():
                self._pending_room_join.set_result(message)
            return
        if message_type == "error":
            self.errors.append(f"error del servidor: {message}")
            return
        if message_type == "domain_event" and self._on_domain_event is not None:
            result = self._on_domain_event(message, receive_time)
            if asyncio.iscoroutine(result):
                await result

    async def close(self) -> None:
        if self._recv_task is not None:
            self._recv_task.cancel()
            try:
                await self._recv_task
            except (asyncio.CancelledError, Exception):  # noqa: BLE001
                pass
        if self._connection is not None:
            await self._connection.close()
