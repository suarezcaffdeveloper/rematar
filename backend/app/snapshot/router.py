"""Endpoints HTTP del Snapshot Service (Épica 3, Módulo 3.6). Ver
docs/23-snapshot-service.md.

Existe para demostrar -- no solo declarar -- que `SnapshotService` es reutilizable por
cualquier transporte: es el mismo servicio, con la misma firma, que usa el Gateway
WebSocket al entrar a una sala (`app/websocket/router.py`). No vive dentro de
`app/modules/remates/` (no se modifica ese router) — se monta directamente en
`app/api/router.py` con el mismo path efectivo que tendría si colgara de ahí
(`/remates/{remate_id}/snapshot`), sin tocar un solo archivo de ese módulo.

`get_lote_recent_offers` (Timed Auctions) cuelga de `/remates/{remate_id}/lotes/
{lote_id}/ofertas/recientes` -- mismo criterio que `app/timer/router.py`, ese path
"pertenece" al módulo de `ofertas`, pero el endpoint no puede vivir en
`app/modules/ofertas/router.py`: ese paquete tiene prohibido importar `app.snapshot`
(dependencia de un solo sentido, ver `tests/test_architecture_boundaries.py::
test_auction_engine_never_imports_websockets_realtime_or_snapshot`). Se monta acá,
con el mismo path efectivo que tendría colgado de ahí, igual que `snapshot`/`timer` ya
hacen con `remates/lotes`.
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends

from app.modules.auth.dependencies import get_current_user_optional
from app.modules.users.models import User
from app.presence.dependencies import get_presence_service
from app.presence.service import PresenceService
from app.snapshot.dependencies import get_snapshot_service
from app.snapshot.schemas import OfertaSnapshotEntry, RemateStateSnapshot
from app.snapshot.service import SnapshotService

router = APIRouter()


@router.get(
    "/remates/{remate_id}/snapshot",
    response_model=RemateStateSnapshot,
    summary=(
        "Estado completo y actual de un remate (RF-16), sin esperar eventos -- "
        "visible también para un visitante anónimo, ADR-049"
    ),
)
async def get_remate_snapshot(
    remate_id: uuid.UUID,
    current_user: Annotated[User | None, Depends(get_current_user_optional)],
    service: Annotated[SnapshotService, Depends(get_snapshot_service)],
    presence_service: Annotated[PresenceService, Depends(get_presence_service)],
) -> RemateStateSnapshot:
    # `PresenceService` (Épica 6, Módulo 6.2) lee del mismo `RoomManager`/
    # `ConnectionManager` que usa el Gateway WebSocket (Módulo 3.3/3.4) -- se inyecta
    # acá como cualquier otra dependencia compartida de la app, sin que
    # `SnapshotService` en sí necesite saber que existe (ver ADR-026, sección C).
    connected_users_detail = presence_service.connected_users_summary(remate_id)
    return await service.build(
        remate_id,
        current_user,
        connected_users=len(connected_users_detail),
        connected_users_detail=connected_users_detail,
    )


@router.get(
    "/remates/{remate_id}/lotes/{lote_id}/ofertas/recientes",
    response_model=list[OfertaSnapshotEntry],
    summary=(
        "Últimas ofertas de un lote puntual, enmascaradas para el comprador -- Timed "
        "Auctions (varios lotes `open` a la vez, sin un único 'lote activo' como LIVE)"
    ),
)
async def get_lote_recent_offers(
    remate_id: uuid.UUID,
    lote_id: uuid.UUID,
    current_user: Annotated[User | None, Depends(get_current_user_optional)],
    service: Annotated[SnapshotService, Depends(get_snapshot_service)],
) -> list[OfertaSnapshotEntry]:
    return await service.get_lote_recent_offers(remate_id, lote_id, current_user)
