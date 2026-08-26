"""Endpoints HTTP del Moderation Service (Épica 7, Módulo 7.6). Ver
docs/42-moderacion-en-tiempo-real.md y ADR-045.

Montado en `/remates/{remate_id}/moderation/...`, top-level (no dentro de
`app/modules/remates/`) -- mismo criterio que `chat_router`/`postauction_router`.
Escritura (expulsar/silenciar/bloquear-chat/destacar/quitar-destacado): dueño del
remate o el rematador asignado como operador (ADR-048), sin excepción para admin.
Lectura (conectados/historial): dueño, rematador asignado o admin.
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status

from app.common.schemas import Page
from app.moderation.dependencies import get_moderation_service
from app.moderation.schemas import (
    ConnectedBuyerRead,
    KickRequest,
    LockChatRequest,
    ModerationHistoryEntry,
    MuteRequest,
    PinnedMessageRead,
)
from app.moderation.service import ModerationService
from app.modules.auth.dependencies import get_current_user
from app.modules.users.models import User

router = APIRouter()

DEFAULT_PAGE_SIZE = 20


@router.post(
    "/remates/{remate_id}/moderation/expulsar",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Expulsar a un comprador de la sala e impedir su reingreso -- dueño o rematador asignado",
)
async def kick_buyer(
    remate_id: uuid.UUID,
    data: KickRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[ModerationService, Depends(get_moderation_service)],
) -> None:
    await service.kick_user(remate_id, current_user, data.user_id, data.reason)


@router.post(
    "/remates/{remate_id}/moderation/silenciar",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Silenciar temporalmente a un comprador -- dueño o rematador asignado",
)
async def mute_buyer(
    remate_id: uuid.UUID,
    data: MuteRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[ModerationService, Depends(get_moderation_service)],
) -> None:
    await service.mute_user(remate_id, current_user, data.user_id, data.duration_seconds)


@router.post(
    "/remates/{remate_id}/moderation/bloquear-chat",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Bloquear el envío de mensajes para toda la sala por un tiempo configurable",
)
async def lock_chat(
    remate_id: uuid.UUID,
    data: LockChatRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[ModerationService, Depends(get_moderation_service)],
) -> None:
    await service.lock_chat(remate_id, current_user, data.duration_seconds)


@router.post(
    "/remates/{remate_id}/moderation/mensajes/{message_id}/destacar",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Destacar un mensaje del chat (anuncio del rematador) -- dueño o rematador asignado",
)
async def pin_message(
    remate_id: uuid.UUID,
    message_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[ModerationService, Depends(get_moderation_service)],
) -> None:
    await service.pin_message(remate_id, current_user, message_id)


@router.delete(
    "/remates/{remate_id}/moderation/mensajes/{message_id}/destacar",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Quitar el destacado de un mensaje -- dueño o rematador asignado",
)
async def unpin_message(
    remate_id: uuid.UUID,
    message_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[ModerationService, Depends(get_moderation_service)],
) -> None:
    await service.unpin_message(remate_id, current_user, message_id)


@router.get(
    "/remates/{remate_id}/moderation/conectados",
    response_model=list[ConnectedBuyerRead],
    summary="Compradores conectados a la sala, con estado y búsqueda por nombre -- dueño, rematador asignado o admin",
)
async def list_connected_buyers(
    remate_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[ModerationService, Depends(get_moderation_service)],
    search: str | None = None,
) -> list[ConnectedBuyerRead]:
    return await service.list_connected_buyers(remate_id, current_user, search=search)


@router.get(
    "/remates/{remate_id}/moderation/destacados",
    response_model=list[PinnedMessageRead],
    summary="Mensajes destacados del remate",
)
async def list_pinned_messages(
    remate_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[ModerationService, Depends(get_moderation_service)],
) -> list[PinnedMessageRead]:
    return await service.list_pinned_messages(remate_id, current_user)


@router.get(
    "/remates/{remate_id}/moderation/historial",
    response_model=Page[ModerationHistoryEntry],
    summary="Historial reciente de acciones de moderación -- dueño, rematador asignado o admin",
)
async def list_recent_moderation_actions(
    remate_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[ModerationService, Depends(get_moderation_service)],
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=DEFAULT_PAGE_SIZE, ge=1, le=100),
) -> Page[ModerationHistoryEntry]:
    items, total = await service.list_recent_actions(
        remate_id, current_user, page=page, page_size=page_size
    )
    return Page[ModerationHistoryEntry](
        items=[ModerationHistoryEntry.model_validate(item) for item in items],
        total=total,
        page=page,
        page_size=page_size,
    )
