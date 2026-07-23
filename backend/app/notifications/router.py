"""Endpoints HTTP del Notification Service (Épica 7, Módulo 7.5). Ver
docs/41-gestion-post-remate.md y ADR-044.

Sin `service.py`: la única regla de negocio ("es tuya, marcala leída") ya la aplica
`NotificationRepository.mark_read` devolviendo `None` si no es del usuario -- no hay
lógica adicional que justifique una capa intermedia, mismo criterio que evitar
abstracciones sin uso real (ver docstring de `app/notifications/__init__.py`).
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status

from app.common.schemas import Page
from app.core.exceptions import NotFoundError
from app.modules.auth.dependencies import get_current_user
from app.modules.users.models import User
from app.notifications.dependencies import get_notification_repository
from app.notifications.repository import NotificationRepository
from app.notifications.schemas import NotificationRead, UnreadCountResponse

router = APIRouter()

DEFAULT_PAGE_SIZE = 20


@router.get(
    "/notifications",
    response_model=Page[NotificationRead],
    summary="Listar mis notificaciones",
)
async def list_notifications(
    current_user: Annotated[User, Depends(get_current_user)],
    repository: Annotated[NotificationRepository, Depends(get_notification_repository)],
    unread_only: bool = Query(default=False),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=DEFAULT_PAGE_SIZE, ge=1, le=100),
) -> Page[NotificationRead]:
    offset = (page - 1) * page_size
    items, total = await repository.list_for_user(
        current_user.id, unread_only=unread_only, offset=offset, limit=page_size
    )
    return Page[NotificationRead](
        items=[NotificationRead.model_validate(item) for item in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get(
    "/notifications/no-leidas/conteo",
    response_model=UnreadCountResponse,
    summary="Cantidad de notificaciones no leídas",
)
async def count_unread_notifications(
    current_user: Annotated[User, Depends(get_current_user)],
    repository: Annotated[NotificationRepository, Depends(get_notification_repository)],
) -> UnreadCountResponse:
    return UnreadCountResponse(unread_count=await repository.count_unread(current_user.id))


@router.patch(
    "/notifications/{notification_id}/leer",
    response_model=NotificationRead,
    summary="Marcar una notificación propia como leída",
)
async def mark_notification_read(
    notification_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    repository: Annotated[NotificationRepository, Depends(get_notification_repository)],
) -> NotificationRead:
    notification = await repository.mark_read(notification_id, current_user.id)
    if notification is None:
        raise NotFoundError("Notificación no encontrada.")
    await repository.commit()
    await repository.refresh(notification)
    return NotificationRead.model_validate(notification)


@router.post(
    "/notifications/leer-todas",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Marcar todas mis notificaciones como leídas",
)
async def mark_all_notifications_read(
    current_user: Annotated[User, Depends(get_current_user)],
    repository: Annotated[NotificationRepository, Depends(get_notification_repository)],
) -> None:
    await repository.mark_all_read(current_user.id)
    await repository.commit()
