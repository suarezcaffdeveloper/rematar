"""Endpoint HTTP del Presence Service (Épica 6, Módulo 6.2). Ver
docs/33-sistema-de-presencia.md.

`GET /presence/global` es el único dato de presencia que no viaja ya, completo, por el
Snapshot Service (HTTP o WebSocket): un conteo agregado de todas las salas del proceso,
no de un remate puntual. No existe un endpoint HTTP por-remate acá a propósito -- ese
dato ya lo expone `GET /remates/{remate_id}/snapshot` (`app/snapshot/router.py`) y,
en vivo, los eventos `presencia.usuario_conectado`/`desconectado`; un tercer endpoint
sería redundante.
"""

from typing import Annotated

from fastapi import APIRouter, Depends

from app.modules.auth.dependencies import get_current_user
from app.modules.users.models import User
from app.presence.dependencies import get_presence_service
from app.presence.schemas import PresenceGlobalStats
from app.presence.service import PresenceService

router = APIRouter()


@router.get(
    "/presence/global",
    response_model=PresenceGlobalStats,
    summary="Conteo global de usuarios conectados (todas las salas del proceso)",
)
async def get_presence_global_stats(
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[PresenceService, Depends(get_presence_service)],
) -> PresenceGlobalStats:
    return service.global_stats()
