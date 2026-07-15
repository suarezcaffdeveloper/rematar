"""Utilidades compartidas del Gateway. Ver docs/20-gateway-websocket.md."""

import structlog
from fastapi import WebSocket

logger = structlog.get_logger(__name__)


async def safe_close(websocket: WebSocket, *, code: int, reason: str) -> None:
    """`WebSocket.close()` puede fallar si el cliente ya se desconectó por su cuenta
    justo antes de que el servidor decida cerrar (condición de carrera inevitable) —
    nunca debe propagarse: cerrar una conexión que ya está cerrada es, en los hechos,
    un no-op."""
    try:
        await websocket.close(code=code, reason=reason)
    except Exception:
        logger.debug("ws_close_failed_already_disconnected", code=code)
