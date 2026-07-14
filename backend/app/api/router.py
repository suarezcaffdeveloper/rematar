"""Composición de todos los routers de módulo bajo un único prefijo versionado.

Fases futuras agregan acá su propio `include_router` (remates, lotes, ofertas,
notificaciones) — este archivo es el único lugar que necesita tocarse para exponer un
módulo nuevo en la API pública, sin que `main.py` sepa nada de módulos individuales.
"""

from fastapi import APIRouter

from app.modules.auth.router import router as auth_router
from app.modules.remates.router import router as remates_router
from app.modules.users.router import router as users_router

api_router = APIRouter()
api_router.include_router(auth_router, prefix="/auth", tags=["auth"])
api_router.include_router(users_router, prefix="/users", tags=["users"])
api_router.include_router(remates_router, prefix="/remates", tags=["remates"])
