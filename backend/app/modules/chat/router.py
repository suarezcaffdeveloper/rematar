"""Endpoints del Chat del Remate (Épica 6, Módulo 6.4). Ver docs/34-chat-del-remate.md.

Montado directamente en `app/api/router.py` con el path efectivo
`/remates/{remate_id}/chat/...`, sin vivir dentro de `app/modules/remates/` -- mismo
criterio que `app/snapshot/router.py` (Módulo 3.6): un módulo top-level propio que no
necesita tocar el router de remates para exponerse bajo su mismo prefijo.

`send_chat_message` gana un chequeo de moderación (Épica 7, Módulo 7.6, ver
docs/42-moderacion-en-tiempo-real.md y ADR-045) **antes** de llamar a
`ChatService.send_message` -- silenciado individual o bloqueo de sala completa,
ambos estado efímero en Redis (`ModerationRedisGateway`, no `ModerationService`: esta
única lectura no necesita el resto de lo que compone el servicio completo). `ChatService`
no se modifica en absoluto.
"""

import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status

from app.core.exceptions import ForbiddenError
from app.moderation.dependencies import get_moderation_redis_gateway
from app.moderation.redis_state import ModerationRedisGateway
from app.modules.auth.dependencies import get_current_user
from app.modules.chat.dependencies import get_chat_service
from app.modules.chat.models import ChatMessage
from app.modules.chat.schemas import ChatMessageCreate, ChatMessageRead
from app.modules.chat.service import ChatService
from app.modules.users.models import User

router = APIRouter()


async def _assert_can_send_message(
    remate_id: uuid.UUID, user_id: uuid.UUID, gateway: ModerationRedisGateway
) -> None:
    if await gateway.is_chat_locked(remate_id):
        raise ForbiddenError("El chat está bloqueado temporalmente por el rematador.")
    if await gateway.is_muted(remate_id, user_id):
        raise ForbiddenError("Estás silenciado temporalmente en este chat.")


@router.post(
    "/remates/{remate_id}/chat/messages",
    response_model=ChatMessageRead,
    status_code=status.HTTP_201_CREATED,
    summary="Enviar un mensaje al chat del remate",
)
async def send_chat_message(
    remate_id: uuid.UUID,
    data: ChatMessageCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[ChatService, Depends(get_chat_service)],
    moderation_gateway: Annotated[
        ModerationRedisGateway, Depends(get_moderation_redis_gateway)
    ],
) -> ChatMessage:
    await _assert_can_send_message(remate_id, current_user.id, moderation_gateway)
    return await service.send_message(remate_id, current_user, data)


@router.get(
    "/remates/{remate_id}/chat/messages",
    response_model=list[ChatMessageRead],
    summary="Historial de mensajes del chat (más recientes, o anteriores a un cursor)",
)
async def list_chat_messages(
    remate_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[ChatService, Depends(get_chat_service)],
    before_created_at: datetime | None = Query(  # noqa: B008
        default=None, description="Junto con before_id, pide mensajes anteriores a este."
    ),
    before_id: uuid.UUID | None = Query(default=None),  # noqa: B008
) -> list[ChatMessage]:
    if before_created_at is not None and before_id is not None:
        return await service.list_before(
            remate_id, current_user, before_created_at=before_created_at, before_id=before_id
        )
    return await service.list_recent(remate_id, current_user)


@router.delete(
    "/remates/{remate_id}/chat/messages/{message_id}",
    response_model=ChatMessageRead,
    summary="Eliminar (moderar) un mensaje -- solo el rematador dueño del remate",
)
async def delete_chat_message(
    remate_id: uuid.UUID,
    message_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[ChatService, Depends(get_chat_service)],
) -> ChatMessage:
    return await service.delete_message(remate_id, message_id, current_user)


@router.post(
    "/remates/{remate_id}/chat/typing",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Avisar que el usuario está escribiendo (de mejor esfuerzo, con rate limit)",
)
async def notify_chat_typing(
    remate_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[ChatService, Depends(get_chat_service)],
) -> None:
    await service.notify_typing(remate_id, current_user)
