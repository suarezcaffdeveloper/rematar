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
# Épica 7, Módulo 7.6 (Moderación) -- expulsión de un comprador de la sala, ver
# app/moderation/service.py::ModerationService.kick_user.
KICKED = 4403
# Fase 4 de remediación del WebSocket Security Audit -- ver app/websocket/rate_limit.py.
# MESSAGE_TOO_LARGE (evoca 413 Payload Too Large): un frame CLIENTE -> SERVIDOR superó
# WS_MAX_MESSAGE_BYTES. RATE_LIMITED (evoca 429 Too Many Requests): se usa para las tres
# violaciones de rate limit que ameritan cerrar la conexión en vez de responder con un
# `ErrorMessage` recuperable (límite de conexiones nuevas por IP, límite de conexiones
# simultáneas por usuario, límite general de mensajes por conexión) -- un único código
# alcanza porque el `reason`/los logs ya distinguen cuál de las tres fue.
MESSAGE_TOO_LARGE = 4413
RATE_LIMITED = 4429

# Estándar (RFC 6455).
SERVER_SHUTTING_DOWN = 1001
INTERNAL_ERROR = 1011
