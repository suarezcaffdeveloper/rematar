"""Composición de todos los routers de módulo bajo un único prefijo versionado.

Fases futuras agregan acá su propio `include_router` (notificaciones, salas) — este
archivo es el único lugar que necesita tocarse para exponer un módulo nuevo en la API
pública, sin que `main.py` sepa nada de módulos individuales.

`websocket_router` (Épica 3, Módulo 3.3) es infraestructura transversal, no un módulo de
dominio — se compone acá igual que cualquier otro, `include_router` no distingue entre
rutas HTTP y WebSocket.
"""

from fastapi import APIRouter

from app.modules.auth.router import router as auth_router
from app.modules.remates.router import router as remates_router
from app.modules.users.router import router as users_router
from app.websocket.router import router as websocket_router

api_router = APIRouter()
api_router.include_router(auth_router, prefix="/auth", tags=["auth"])
api_router.include_router(users_router, prefix="/users", tags=["users"])
api_router.include_router(remates_router, prefix="/remates", tags=["remates"])
api_router.include_router(websocket_router, tags=["websocket"])
