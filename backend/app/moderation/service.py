"""`ModerationService` (Épica 7, Módulo 7.6). Ver docs/42-moderacion-en-tiempo-real.md y
ADR-045.

Compone `RemateService` (ownership, mismo patrón que `ChatService`/`AuctionEngine`),
`ChatMessageRepository`/`UserRepository`/`RemateRepository` directo (nunca sus
`Service`, mismo criterio "repositorio del vecino" que ya usa el resto del proyecto) y
`ConnectionManager`/`RoomManager`/`PresenceService` (`app/websocket/`, `app/presence/`,
sin modificarlos) para poder expulsar y listar conectados. Todas las acciones de
escritura son exclusivas del dueño del remate -- sin excepción para admin, mismo
criterio restrictivo que `ChatService.delete_message` ya aplica a la moderación de chat.
"""

import uuid

from app.audit.actions import AuditAction
from app.audit.repository import AuditLogRepository
from app.core.config import Settings
from app.core.exceptions import ForbiddenError, NotFoundError
from app.events.bus import EventBus
from app.moderation.events import (
    ModerationChatLocked,
    ModerationInvalidBidThresholdExceeded,
    ModerationMessagePinned,
    ModerationMessageUnpinned,
    ModerationUserKicked,
    ModerationUserMuted,
)
from app.moderation.models import ModerationPinnedMessage, RemateBan
from app.moderation.redis_state import ModerationRedisGateway
from app.moderation.repository import ModerationRepository
from app.moderation.schemas import ConnectedBuyerRead, PinnedMessageRead
from app.modules.chat.models import ChatMessage
from app.modules.chat.repository import ChatMessageRepository
from app.modules.remates.repository import RemateRepository
from app.modules.remates.service import RemateService
from app.modules.users.models import User, UserRole
from app.modules.users.repository import UserRepository
from app.notifications.repository import NotificationRepository
from app.presence.service import PresenceService
from app.websocket.close_codes import KICKED
from app.websocket.manager import ConnectionManager
from app.websocket.rooms import RoomManager
from app.websocket.utils import safe_close

# Namespace completo de acciones de moderación auditadas -- lo que consulta
# `list_recent_actions` para el "historial reciente" del panel. Incluye
# `CHAT_MESSAGE_DELETED`: borrar un mensaje también es una acción de moderación,
# aunque su escritura viva en `ChatService`.
MODERATION_HISTORY_ACTIONS: list[str] = [
    AuditAction.MODERATION_USER_KICKED,
    AuditAction.MODERATION_USER_MUTED,
    AuditAction.MODERATION_CHAT_LOCKED,
    AuditAction.MODERATION_MESSAGE_PINNED,
    AuditAction.MODERATION_MESSAGE_UNPINNED,
    AuditAction.MODERATION_INVALID_BID_ATTEMPT,
    AuditAction.MODERATION_INVALID_BID_THRESHOLD_EXCEEDED,
    AuditAction.CHAT_MESSAGE_DELETED,
]


class ModerationService:
    def __init__(
        self,
        repository: ModerationRepository,
        redis_gateway: ModerationRedisGateway,
        connection_manager: ConnectionManager,
        room_manager: RoomManager,
        presence_service: PresenceService,
        remate_service: RemateService,
        remate_repository: RemateRepository,
        chat_message_repository: ChatMessageRepository,
        user_repository: UserRepository,
        audit_repository: AuditLogRepository,
        notification_repository: NotificationRepository,
        event_bus: EventBus,
        settings: Settings,
    ) -> None:
        self._repository = repository
        self._redis_gateway = redis_gateway
        self._connection_manager = connection_manager
        self._room_manager = room_manager
        self._presence_service = presence_service
        self._remate_service = remate_service
        self._remate_repository = remate_repository
        self._chat_message_repository = chat_message_repository
        self._user_repository = user_repository
        self._audit_repository = audit_repository
        self._notification_repository = notification_repository
        self._event_bus = event_bus
        self._settings = settings

    # --- Compradores conectados / expulsión / silenciamiento ----------------------------

    async def _get_comprador_or_raise(self, user_id: uuid.UUID) -> User:
        target = await self._user_repository.get_by_id(user_id)
        if target is None or target.role != UserRole.COMPRADOR:
            raise NotFoundError("Comprador no encontrado.")
        return target

    async def kick_user(
        self, remate_id: uuid.UUID, actor: User, target_user_id: uuid.UUID, reason: str | None
    ) -> None:
        await self._remate_service.get_owned_or_raise(remate_id, actor)
        target = await self._get_comprador_or_raise(target_user_id)

        existing_ban = await self._repository.get_ban(remate_id, target_user_id)
        if existing_ban is None:
            self._repository.add_ban(
                RemateBan(
                    remate_id=remate_id,
                    user_id=target_user_id,
                    banned_by_id=actor.id,
                    reason=reason,
                )
            )

        self._audit_repository.record(
            actor_id=actor.id,
            actor_name=actor.full_name,
            actor_role=actor.role.value,
            action=AuditAction.MODERATION_USER_KICKED,
            resource_type="user",
            resource_id=target_user_id,
            remate_id=remate_id,
            details={"reason": reason},
        )
        await self._repository.commit()

        # Corta cualquier conexión activa de ese usuario en esta sala -- el propio
        # `finally` de `_run_connection_loop` (app/websocket/router.py) hace el cleanup
        # de sala/presencia al recibir el `WebSocketDisconnect` resultante; no se
        # duplica esa lógica acá (ver ADR-045, sección C).
        for context in self._connection_manager.connections_for_user(target_user_id):
            if self._room_manager.room_id_for_connection(context.connection_id) == remate_id:
                await safe_close(
                    context.websocket, code=KICKED, reason="Fuiste expulsado del remate."
                )

        await self._event_bus.publish(
            ModerationUserKicked(
                remate_id=remate_id,
                user_id=target_user_id,
                user_name=target.full_name,
                banned_by=actor.id,
                reason=reason,
            )
        )

    async def mute_user(
        self, remate_id: uuid.UUID, actor: User, target_user_id: uuid.UUID, duration_seconds: int
    ) -> None:
        await self._remate_service.get_owned_or_raise(remate_id, actor)
        target = await self._get_comprador_or_raise(target_user_id)

        await self._redis_gateway.mute(remate_id, target_user_id, duration_seconds)
        self._audit_repository.record(
            actor_id=actor.id,
            actor_name=actor.full_name,
            actor_role=actor.role.value,
            action=AuditAction.MODERATION_USER_MUTED,
            resource_type="user",
            resource_id=target_user_id,
            remate_id=remate_id,
            details={"duration_seconds": duration_seconds},
        )
        await self._repository.commit()
        await self._event_bus.publish(
            ModerationUserMuted(
                remate_id=remate_id,
                user_id=target_user_id,
                user_name=target.full_name,
                muted_by=actor.id,
                duration_seconds=duration_seconds,
            )
        )

    async def lock_chat(self, remate_id: uuid.UUID, actor: User, duration_seconds: int) -> None:
        await self._remate_service.get_owned_or_raise(remate_id, actor)

        await self._redis_gateway.lock_chat(remate_id, duration_seconds)
        self._audit_repository.record(
            actor_id=actor.id,
            actor_name=actor.full_name,
            actor_role=actor.role.value,
            action=AuditAction.MODERATION_CHAT_LOCKED,
            resource_type="remate",
            resource_id=remate_id,
            remate_id=remate_id,
            details={"duration_seconds": duration_seconds},
        )
        await self._repository.commit()
        await self._event_bus.publish(
            ModerationChatLocked(
                remate_id=remate_id, locked_by=actor.id, duration_seconds=duration_seconds
            )
        )

    async def is_banned(self, remate_id: uuid.UUID, user_id: uuid.UUID) -> bool:
        """Usado únicamente por `app/websocket/router.py::_handle_join_room` antes de
        delegar en `PresenceService.join_room`."""
        return await self._repository.is_banned(remate_id, user_id)

    async def list_connected_buyers(
        self, remate_id: uuid.UUID, viewer: User, *, search: str | None
    ) -> list[ConnectedBuyerRead]:
        remate = await self._remate_service.get_visible_or_raise(remate_id, viewer)
        self._assert_can_read(remate, viewer)

        summaries = self._presence_service.connected_users_summary(remate_id)
        earliest_by_user = {}
        for summary in summaries:
            existing = earliest_by_user.get(summary.user_id)
            if existing is None or summary.connected_at < existing.connected_at:
                earliest_by_user[summary.user_id] = summary

        users = await self._repository.get_users_by_ids(set(earliest_by_user.keys()))
        needle = search.strip().lower() if search else None

        results: list[ConnectedBuyerRead] = []
        for user_id, summary in earliest_by_user.items():
            user = users.get(user_id)
            if user is None or user.role != UserRole.COMPRADOR:
                continue
            if needle and needle not in (user.full_name or "").lower():
                continue
            is_muted = await self._redis_gateway.is_muted(remate_id, user_id)
            results.append(
                ConnectedBuyerRead(
                    user_id=user_id,
                    full_name=user.full_name,
                    connected_at=summary.connected_at,
                    is_muted=is_muted,
                )
            )

        results.sort(key=lambda row: row.full_name or "")
        return results

    # --- Mensajes destacados -------------------------------------------------------------

    async def pin_message(
        self, remate_id: uuid.UUID, actor: User, message_id: uuid.UUID
    ) -> ModerationPinnedMessage:
        await self._remate_service.get_owned_or_raise(remate_id, actor)
        message = await self._get_own_message_or_raise(remate_id, message_id)

        existing = await self._repository.get_pin(message_id)
        if existing is not None:
            return existing  # idempotente

        pin = ModerationPinnedMessage(
            remate_id=remate_id, message_id=message_id, pinned_by_id=actor.id
        )
        self._repository.add_pin(pin)
        self._audit_repository.record(
            actor_id=actor.id,
            actor_name=actor.full_name,
            actor_role=actor.role.value,
            action=AuditAction.MODERATION_MESSAGE_PINNED,
            resource_type="chat_message",
            resource_id=message_id,
            remate_id=remate_id,
            details={"content_preview": message.content[:100]},
        )
        await self._repository.commit()
        await self._repository.refresh(pin)
        await self._event_bus.publish(
            ModerationMessagePinned(remate_id=remate_id, message_id=message_id, pinned_by=actor.id)
        )
        return pin

    async def unpin_message(self, remate_id: uuid.UUID, actor: User, message_id: uuid.UUID) -> None:
        await self._remate_service.get_owned_or_raise(remate_id, actor)

        pin = await self._repository.get_pin(message_id)
        if pin is None or pin.remate_id != remate_id:
            raise NotFoundError("El mensaje no está destacado.")

        await self._repository.remove_pin(pin)
        self._audit_repository.record(
            actor_id=actor.id,
            actor_name=actor.full_name,
            actor_role=actor.role.value,
            action=AuditAction.MODERATION_MESSAGE_UNPINNED,
            resource_type="chat_message",
            resource_id=message_id,
            remate_id=remate_id,
        )
        await self._repository.commit()
        await self._event_bus.publish(
            ModerationMessageUnpinned(remate_id=remate_id, message_id=message_id)
        )

    async def list_pinned_messages(
        self, remate_id: uuid.UUID, viewer: User
    ) -> list[PinnedMessageRead]:
        # Cualquiera que vea el remate puede ver qué mensajes están destacados -- son
        # visibles igual dentro del propio chat, no es información sensible.
        await self._remate_service.get_visible_or_raise(remate_id, viewer)

        pins = await self._repository.list_pinned(remate_id)
        results: list[PinnedMessageRead] = []
        for pin in pins:
            message = await self._chat_message_repository.get_by_id(pin.message_id)
            content = message.content if message is not None and not message.is_deleted else None
            results.append(
                PinnedMessageRead(
                    message_id=pin.message_id,
                    content=content,
                    author_name=message.author_name if message is not None else None,
                    pinned_by=pin.pinned_by_id,
                    pinned_at=pin.pinned_at,
                )
            )
        return results

    async def _get_own_message_or_raise(
        self, remate_id: uuid.UUID, message_id: uuid.UUID
    ) -> ChatMessage:
        message = await self._chat_message_repository.get_by_id(message_id)
        if message is None or message.remate_id != remate_id:
            raise NotFoundError("Mensaje no encontrado.")
        return message

    # --- Historial (vía Audit Service) --------------------------------------------------

    async def list_recent_actions(
        self, remate_id: uuid.UUID, viewer: User, *, page: int, page_size: int
    ):
        remate = await self._remate_service.get_visible_or_raise(remate_id, viewer)
        self._assert_can_read(remate, viewer)

        offset = (page - 1) * page_size
        return await self._audit_repository.list_paginated(
            offset=offset,
            limit=page_size,
            remate_id=remate_id,
            actions=MODERATION_HISTORY_ACTIONS,
            sort="desc",
        )

    @staticmethod
    def _assert_can_read(remate, viewer: User) -> None:
        if viewer.role != UserRole.ADMIN and remate.owner_id != viewer.id:
            raise ForbiddenError(
                "Solo el rematador dueño del remate (o un administrador) puede ver esto."
            )

    # --- Intentos de oferta inválidos (disparado por `realtime.py`, no por HTTP) --------

    async def record_invalid_bid_attempt(
        self,
        *,
        remate_id: uuid.UUID,
        lote_id: uuid.UUID,
        buyer_id: uuid.UUID,
        amount: str,
        reason: str,
    ) -> None:
        buyer = await self._user_repository.get_by_id(buyer_id)
        self._audit_repository.record(
            actor_id=buyer_id,
            actor_name=buyer.full_name if buyer else None,
            actor_role=buyer.role.value if buyer else None,
            action=AuditAction.MODERATION_INVALID_BID_ATTEMPT,
            resource_type="oferta",
            resource_id=None,
            remate_id=remate_id,
            details={"lote_id": str(lote_id), "amount": amount, "reason": reason},
        )

        count = await self._redis_gateway.record_invalid_bid_attempt(
            remate_id, buyer_id, window_seconds=self._settings.MODERATION_INVALID_BID_WINDOW_SECONDS
        )
        threshold = self._settings.MODERATION_INVALID_BID_THRESHOLD
        already_notified = await self._redis_gateway.has_notified_invalid_bid_threshold(
            remate_id, buyer_id
        )
        should_notify = count >= threshold and not already_notified

        if should_notify:
            remate = await self._remate_repository.get_by_id(remate_id)
            if remate is not None:
                self._audit_repository.record(
                    actor_id=None,
                    actor_name=None,
                    actor_role=None,
                    action=AuditAction.MODERATION_INVALID_BID_THRESHOLD_EXCEEDED,
                    resource_type="user",
                    resource_id=buyer_id,
                    remate_id=remate_id,
                    details={"attempt_count": count, "threshold": threshold},
                )
                self._notification_repository.create(
                    user_id=remate.owner_id,
                    type=AuditAction.MODERATION_INVALID_BID_THRESHOLD_EXCEEDED,
                    title="Intentos de oferta inválidos",
                    message=(
                        f"{buyer.full_name if buyer else 'Un comprador'} superó el umbral de "
                        f"intentos de oferta inválidos ({count})."
                    ),
                    resource_type="remate",
                    resource_id=remate_id,
                    remate_id=remate_id,
                )
            else:
                should_notify = False

        await self._repository.commit()

        if should_notify:
            await self._redis_gateway.mark_invalid_bid_threshold_notified(
                remate_id,
                buyer_id,
                window_seconds=self._settings.MODERATION_INVALID_BID_WINDOW_SECONDS,
            )
            await self._event_bus.publish(
                ModerationInvalidBidThresholdExceeded(
                    remate_id=remate_id, buyer_id=buyer_id, attempt_count=count, threshold=threshold
                )
            )
