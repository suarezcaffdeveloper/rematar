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

`analytics_router` (Épica 7, Módulo 7.1) expone `GET /remates/{remate_id}/analytics` —
mismo criterio que `snapshot_router`, un paquete transversal (`app/analytics/`, sin
modelo propio) montado directamente acá (ver docs/35-dashboard-analitica-tiempo-real.md).

`audit_router` (Épica 7, Módulo 7.2) expone `GET /audit` (global, solo admin) y
`GET /remates/{remate_id}/audit` (dueño o admin) — mismo criterio que `snapshot_router`/
`analytics_router`, un paquete transversal (`app/audit/`) montado directamente acá (ver
docs/36-sistema-de-auditoria-y-trazabilidad.md).

`history_router` (Épica 7, Módulo 7.3) expone `GET /history/remates` (listado global o
scoped según rol), `GET /history/remates/{remate_id}` y
`GET /history/remates/{remate_id}/lotes/{lote_id}` — mismo criterio que `audit_router`,
un paquete transversal (`app/history/`) montado directamente acá (ver
docs/37-historial-y-resultados-de-remates.md).

`monitoring_router` (Épica 8, Módulo 8.1) expone `GET /monitoring/health` (público) y
`GET /monitoring/metrics` (admin) — mismo criterio que `audit_router`/`history_router`,
un paquete transversal (`app/monitoring/`) montado directamente acá (ver
docs/38-observabilidad-y-monitoreo.md).

`timer_router` (Épica 8, "cuenta regresiva y cierre automático") expone
`/remates/{remate_id}/lotes/{lote_id}/timer/...` — mismo criterio que `snapshot_router`,
un paquete transversal (`app/timer/`) montado directamente acá (ver
docs/40-cuenta-regresiva-y-cierre-automatico.md).

`postauction_router` (Épica 7, Módulo 7.5) expone `/postauction/ventas` (rematador) y
`/postauction/mis-compras` (comprador) — mismo criterio que `audit_router`/`history_router`,
un paquete transversal (`app/postauction/`) montado directamente acá (ver
docs/41-gestion-post-remate.md).

`notifications_router` (Épica 7, Módulo 7.5) expone `/notifications` — paquete genérico
propio (`app/notifications/`), montado directamente acá igual que cualquier otro.

`moderation_router` (Épica 7, Módulo 7.6) expone `/remates/{remate_id}/moderation/...` —
mismo criterio que `chat_router`, un paquete top-level propio (`app/moderation/`) que
cuelga del mismo prefijo efectivo sin vivir dentro de `app/modules/remates/` (ver
docs/42-moderacion-en-tiempo-real.md).

`bots_router` (módulo de Bots Simuladores) expone `/bots` (gestión global de perfiles) y
`/remates/{remate_id}/bots/...` (selección y control de simulación por remate) — mismo
criterio que `chat_router`, un módulo top-level propio (`app/modules/bots/`) que no vive
dentro de `app/modules/remates/` pero cuelga del mismo prefijo efectivo.
"""

from fastapi import APIRouter

from app.analytics.router import router as analytics_router
from app.audit.router import router as audit_router
from app.history.router import router as history_router
from app.moderation.router import router as moderation_router
from app.modules.auth.router import router as auth_router
from app.modules.bots.router import router as bots_router
from app.modules.chat.router import router as chat_router
from app.modules.remates.router import router as remates_router
from app.modules.users.router import router as users_router
from app.monitoring.router import router as monitoring_router
from app.notifications.router import router as notifications_router
from app.postauction.router import router as postauction_router
from app.presence.router import router as presence_router
from app.snapshot.router import router as snapshot_router
from app.timer.router import router as timer_router
from app.websocket.router import router as websocket_router

api_router = APIRouter()
api_router.include_router(auth_router, prefix="/auth", tags=["auth"])
api_router.include_router(users_router, prefix="/users", tags=["users"])
api_router.include_router(remates_router, prefix="/remates", tags=["remates"])
api_router.include_router(snapshot_router, tags=["snapshot"])
api_router.include_router(timer_router, tags=["timer"])
api_router.include_router(presence_router, tags=["presence"])
api_router.include_router(chat_router, tags=["chat"])
api_router.include_router(analytics_router, tags=["analytics"])
api_router.include_router(audit_router, tags=["audit"])
api_router.include_router(history_router, tags=["history"])
api_router.include_router(monitoring_router, tags=["monitoring"])
api_router.include_router(postauction_router, tags=["postauction"])
api_router.include_router(notifications_router, tags=["notifications"])
api_router.include_router(moderation_router, tags=["moderation"])
api_router.include_router(bots_router, tags=["bots"])
api_router.include_router(websocket_router, tags=["websocket"])
