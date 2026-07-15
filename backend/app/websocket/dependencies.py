"""Dependencias de FastAPI del `ConnectionManager` (Módulo 3.3) y del `RoomManager`
(Módulo 3.4). Ver docs/20-gateway-websocket.md y docs/21-sistema-de-salas.md."""

from fastapi import WebSocket

from app.websocket.manager import ConnectionManager
from app.websocket.rooms import RoomManager


def get_connection_manager(websocket: WebSocket) -> ConnectionManager:
    return websocket.app.state.connection_manager


def get_room_manager(websocket: WebSocket) -> RoomManager:
    return websocket.app.state.room_manager
