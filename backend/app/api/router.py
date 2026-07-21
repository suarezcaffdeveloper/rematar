"""Composición de todos los routers de módulo bajo un único prefijo versionado.

Fases futuras agregan acá su propio `include_router` (notificaciones) — este archivo es
el único lugar que necesita tocarse para exponer un módulo nuevo en la API pública, sin
que `main.py` sepa nada de módulos individuales.

`websocket_router` (Épica 3, Módulo 3.3) es infraestructura transversal, no un módulo de
dominio — se compone acá igual que cualquier otro, `include_router` no distingue entre
rutas HTTP y WebSocket.

`snapshot_router` (Épica 3, Módulo 3.6) expone `GET /remates/{remate_id}/snapshot` sin
vivir dentro de `app/modules/remates/` — se monta directamente acá, con el mismo path
efectivo que tendría si colgara de ese router, para no tocar un solo archivo de ese
módulo de dominio (ver docs/23-snapshot-service.md).

`presence_router` (Épica 6, Módulo 6.2) expone `GET /presence/global` — mismo criterio
que `snapshot_router`, un paquete transversal que se monta directamente acá (ver
docs/33-sistema-de-presencia.md).

`chat_router` (Épica 6, Módulo 6.4) expone `/remates/{remate_id}/chat/...` — mismo
criterio que `snapshot_router`, un módulo de dominio propio (`app/modules/chat/`) que
no vive dentro de `app/modules/remates/` pero cuelga del mismo prefijo efectivo (ver
docs/34-chat-del-remate.md).
"""

from fastapi import APIRouter

from app.modules.auth.router import router as auth_router
from app.modules.chat.router import router as chat_router
from app.modules.remates.router import router as remates_router
from app.modules.users.router import router as users_router
from app.presence.router import router as presence_router
from app.snapshot.router import router as snapshot_router
from app.websocket.router import router as websocket_router

api_router = APIRouter()
api_router.include_router(auth_router, prefix="/auth", tags=["auth"])
api_router.include_router(users_router, prefix="/users", tags=["users"])
api_router.include_router(remates_router, prefix="/remates", tags=["remates"])
api_router.include_router(snapshot_router, tags=["snapshot"])
api_router.include_router(presence_router, tags=["presence"])
api_router.include_router(chat_router, tags=["chat"])
api_router.include_router(websocket_router, tags=["websocket"])
