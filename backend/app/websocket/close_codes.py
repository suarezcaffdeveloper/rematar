"""Códigos de cierre del protocolo del Gateway (Épica 3, Módulo 3.3). Ver
docs/20-gateway-websocket.md y docs/adr/ADR-023-gateway-websocket.md, sección C.

RFC 6455 reserva 4000-4999 para uso de aplicación. Se eligieron valores que evocan sus
códigos HTTP análogos (400, 401, 408) para que sean reconocibles sin buscar la tabla.
Los estándar (1001, 1011) se reexportan acá para que `router.py` no tenga que mezclar
importaciones de dos lugares distintos.
"""

INVALID_MESSAGE = 4400
UNAUTHORIZED = 4401
AUTH_TIMEOUT = 4408
HEARTBEAT_TIMEOUT = 4000

# Estándar (RFC 6455).
SERVER_SHUTTING_DOWN = 1001
INTERNAL_ERROR = 1011
