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

El bloqueo de sala completa ("bloquear-chat") no aplica al dueño del remate ni al
rematador asignado como operador (ADR-048): son quienes lo activan para frenar el
volumen de mensajes y poder hacerse escuchar, así que tiene que seguir dejándolos
escribir -- si no, se silenciarían a sí mismos junto con el resto. El silenciado
individual sí aplica siempre (nadie se automutea).
"""

import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ForbiddenError
from app.db.session import get_db
from app.moderation.dependencies import get_moderation_redis_gateway
from app.moderation.redis_state import ModerationRedisGateway
from app.modules.auth.dependencies import get_current_user
from app.modules.bots.lookup import BotIdentityResolver
from app.modules.chat.dependencies import get_chat_service
from app.modules.chat.schemas import ChatMessageCreate, ChatMessageRead
from app.modules.chat.service import ChatService
from app.modules.remates.dependencies import get_remate_service
from app.modules.remates.service import RemateService
from app.modules.users.models import User
from app.modules.users.repository import UserRepository

router = APIRouter()


async def _assert_can_send_message(
    remate_id: uuid.UUID,
    user: User,
    gateway: ModerationRedisGateway,
    remate_service: RemateService,
) -> None:
    if await gateway.is_chat_locked(remate_id):
        # El dueño y el rematador asignado pueden seguir escribiendo aunque hayan
        # bloqueado el chat -- ver docstring del módulo.
        remate = await remate_service.get_visible_or_raise(remate_id, user)
        is_owner_or_operator = remate.owner_id == user.id or remate.rematador_id == user.id
        if not is_owner_or_operator:
            raise ForbiddenError("El chat está bloqueado temporalmente por el rematador.")
    if await gateway.is_muted(remate_id, user.id):
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
    remate_service: Annotated[RemateService, Depends(get_remate_service)],
) -> ChatMessageRead:
    await _assert_can_send_message(remate_id, current_user, moderation_gateway, remate_service)
    message = await service.send_message(remate_id, current_user, data)
    # El autor es siempre `current_user` acá -- su avatar ya está en memoria, sin
    # necesidad de la consulta batch que sí hace falta en `list_chat_messages`.
    return ChatMessageRead.model_validate(message).model_copy(
        update={"author_avatar_url": current_user.avatar_url}
    )


@router.get(
    "/remates/{remate_id}/chat/messages",
    response_model=list[ChatMessageRead],
    summary="Historial de mensajes del chat (más recientes, o anteriores a un cursor)",
)
async def list_chat_messages(
    remate_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[ChatService, Depends(get_chat_service)],
    db: Annotated[AsyncSession, Depends(get_db)],
    before_created_at: datetime | None = Query(  # noqa: B008
        default=None, description="Junto con before_id, pide mensajes anteriores a este."
    ),
    before_id: uuid.UUID | None = Query(default=None),  # noqa: B008
) -> list[ChatMessageRead]:
    if before_created_at is not None and before_id is not None:
        messages = await service.list_before(
            remate_id, current_user, before_created_at=before_created_at, before_id=before_id
        )
    else:
        messages = await service.list_recent(remate_id, current_user)

    # `author_id` nunca se enmascara en el chat -- ver docstring de
    # `ChatMessageRead.is_bot`. Una única consulta para todo el historial devuelto.
    author_ids = [m.author_id for m in messages if m.author_id is not None]
    bot_author_ids = await BotIdentityResolver(db).resolve(author_ids)
    # Foto de perfil VIGENTE, no la que el autor tenía al momento de escribir cada
    # mensaje -- ver docstring de `ChatMessageRead.author_avatar_url`. Misma idea que la
    # consulta batch de arriba: una sola consulta para toda la página, sin JOIN por fila.
    avatars_by_author = await UserRepository(db).list_avatars_by_ids(author_ids)
    return [
        ChatMessageRead.model_validate(m).model_copy(
            update={
                "is_bot": m.author_id in bot_author_ids,
                "author_avatar_url": avatars_by_author.get(m.author_id) if m.author_id else None,
            }
        )
        for m in messages
    ]


@router.delete(
    "/remates/{remate_id}/chat/messages/{message_id}",
    response_model=ChatMessageRead,
    summary="Eliminar (moderar) un mensaje -- dueño del remate o rematador asignado",
)
async def delete_chat_message(
    remate_id: uuid.UUID,
    message_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    service: Annotated[ChatService, Depends(get_chat_service)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ChatMessageRead:
    message = await service.delete_message(remate_id, message_id, current_user)
    # Quien borra (moderador) no necesariamente es el autor -- se resuelve el avatar de
    # `message.author_id`, no el de `current_user`. Ver docstring de
    # `ChatMessageRead.author_avatar_url`.
    avatar_url = None
    if message.author_id is not None:
        avatars = await UserRepository(db).list_avatars_by_ids([message.author_id])
        avatar_url = avatars.get(message.author_id)
    return ChatMessageRead.model_validate(message).model_copy(
        update={"author_avatar_url": avatar_url}
    )


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
