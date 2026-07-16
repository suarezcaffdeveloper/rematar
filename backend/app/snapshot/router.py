"""Endpoint HTTP del Snapshot Service (Épica 3, Módulo 3.6). Ver
docs/23-snapshot-service.md.

Existe para demostrar -- no solo declarar -- que `SnapshotService` es reutilizable por
cualquier transporte: es el mismo servicio, con la misma firma, que usa el Gateway
WebSocket al entrar a una sala (`app/websocket/router.py`). No vive dentro de
`app/modules/remates/` (no se modifica ese router) — se monta directamente en
`app/api/router.py` con el mismo path efectivo que tendría si colgara de ahí
(`/remates/{remate_id}/snapshot`), sin tocar un solo archivo de ese módulo.
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Request

from app.modules.auth.dependencies import get_current_user
from app.modules.users.models import User
from app.snapshot.dependencies import get_snapshot_service
from app.snapshot.schemas import RemateStateSnapshot
from app.snapshot.service import SnapshotService

router = APIRouter()


@router.get(
    "/remates/{remate_id}/snapshot",
    response_model=RemateStateSnapshot,
    summary="Estado completo y actual de un remate (RF-16), sin esperar eventos",
)
async def get_remate_snapshot(
    remate_id: uuid.UUID,
    request: Request,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[SnapshotService, Depends(get_snapshot_service)],
) -> RemateStateSnapshot:
    # `app.state.room_manager` es el mismo objeto que usa el Gateway WebSocket (Módulo
    # 3.3/3.4) -- se lee acá como cualquier otro estado compartido de la app, sin que
    # `SnapshotService` en sí necesite saber que existe (ver ADR-026, sección C).
    connected_users = request.app.state.room_manager.connection_count(remate_id)
    return await service.build(remate_id, current_user, connected_users=connected_users)
