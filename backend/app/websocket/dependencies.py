"""Dependencias de FastAPI del `ConnectionManager` (Módulo 3.3) y del `RoomManager`
(Módulo 3.4). Ver docs/20-gateway-websocket.md y docs/21-sistema-de-salas.md.

Deliberadamente sin ninguna dependencia de `app.modules.*` -- la autorización de
`join_room` (Fase 2 de remediación del WebSocket Security Audit) se resuelve
reutilizando `SnapshotService.assert_visible` (`app/snapshot/service.py`), ya inyectado
en `websocket_gateway` para el snapshot inicial de sala; no hizo falta agregar acá
ninguna dependencia nueva. Ver `tests/test_architecture_boundaries.py::
test_gateway_websocket_never_imports_domain`, que verifica en CI que este paquete nunca
importe `app.modules.remates`/`app.modules.ofertas`."""

from fastapi import WebSocket

from app.websocket.manager import ConnectionManager
from app.websocket.rooms import RoomManager


def get_connection_manager(websocket: WebSocket) -> ConnectionManager:
    return websocket.app.state.connection_manager


def get_room_manager(websocket: WebSocket) -> RoomManager:
    return websocket.app.state.room_manager
