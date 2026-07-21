"""`ChatService` (Épica 6, Módulo 6.4). Ver docs/34-chat-del-remate.md y ADR-037.

Punto central de gestión de mensajes -- el "Chat Service desacoplado" que pide el
enunciado. Inyecta `RemateService` completo (no solo su repositorio), mismo patrón que
`AuctionEngine` (`app/modules/ofertas/engine.py`) para reutilizar
`get_visible_or_raise`/`get_owned_or_raise` sin duplicar la lógica de visibilidad/
propiedad de un remate.

## Auditoría (Épica 7, Módulo 7.2)

`delete_message` deja constancia vía `AuditLogRepository.record` (ver docs/36 y
ADR-039), antes del `commit()` que ya existe -- misma transacción. `send_message`/
`record_system_message`/`notify_typing` no auditan nada: solo la eliminación
(moderación) está pedida por el enunciado, y auditar cada mensaje enviado sería un
volumen alto sin valor de auditoría real (el propio historial de chat ya es su
registro).
"""

import uuid
from datetime import UTC, datetime

import structlog
from sqlalchemy.exc import IntegrityError

from app.audit.actions import AuditAction
from app.audit.repository import AuditLogRepository
from app.core.config import Settings
from app.core.exceptions import BusinessRuleError, NotFoundError, RateLimitError
from app.events.bus import EventBus
from app.modules.chat.events import ChatMessageDeleted, ChatMessageSent, ChatUserTyping
from app.modules.chat.models import ChatMessage, ChatMessageKind
from app.modules.chat.repository import ChatMessageRepository
from app.modules.chat.schemas import ChatMessageCreate
from app.modules.remates.service import RemateService
from app.modules.users.models import User
from app.redis.rate_limit import RedisRateLimiter

logger = structlog.get_logger(__name__)


class ChatService:
    def __init__(
        self,
        repository: ChatMessageRepository,
        remate_service: RemateService,
        event_bus: EventBus,
        rate_limiter: RedisRateLimiter,
        settings: Settings,
        audit_repository: AuditLogRepository,
    ) -> None:
        self._repository = repository
        self._remate_service = remate_service
        self._event_bus = event_bus
        self._rate_limiter = rate_limiter
        self._settings = settings
        self._audit_repository = audit_repository

    async def send_message(
        self, remate_id: uuid.UUID, author: User, data: ChatMessageCreate
    ) -> ChatMessage:
        """Sin restricción por estado del remate (se puede chatear en cualquier estado
        visible) -- mismo criterio que Presencia, ver ADR-037."""
        await self._remate_service.get_visible_or_raise(remate_id, author)

        if len(data.content) > self._settings.CHAT_MESSAGE_MAX_LENGTH:
            raise BusinessRuleError(
                f"El mensaje no puede superar los {self._settings.CHAT_MESSAGE_MAX_LENGTH} "
                "caracteres."
            )

        allowed = await self._rate_limiter.check_and_increment(
            self._rate_limit_key(remate_id, author.id),
            limit=self._settings.CHAT_RATE_LIMIT_MAX_MESSAGES,
            window_seconds=self._settings.CHAT_RATE_LIMIT_WINDOW_SECONDS,
        )
        if not allowed:
            raise RateLimitError(
                "Estás enviando mensajes demasiado rápido. Esperá unos segundos."
            )

        message = ChatMessage(
            remate_id=remate_id,
            kind=ChatMessageKind.USER,
            author_id=author.id,
            author_name=author.full_name,
            author_role=author.role.value,
            content=data.content,
        )
        self._repository.add(message)
        await self._repository.commit()
        await self._repository.refresh(message)
        await self._publish_sent(message)
        return message

    async def delete_message(
        self, remate_id: uuid.UUID, message_id: uuid.UUID, moderator: User
    ) -> ChatMessage:
        """Exclusivamente el dueño del remate -- sin excepción para admin, mismo
        criterio restrictivo que ya aplica `RemateService` a sus propias transiciones
        (docs/14-modulo-remate.md: "el admin puede ver todo pero no puede escribir")."""
        await self._remate_service.get_owned_or_raise(remate_id, moderator)

        message = await self._repository.get_by_id(message_id)
        if message is None or message.remate_id != remate_id:
            raise NotFoundError("Mensaje no encontrado.")

        if message.is_deleted:
            return message  # idempotente: ya estaba eliminado, no es un error

        message.deleted_at = datetime.now(UTC)
        message.deleted_by = moderator.id
        self._audit_repository.record(
            actor_id=moderator.id,
            actor_name=moderator.full_name,
            actor_role=moderator.role.value,
            action=AuditAction.CHAT_MESSAGE_DELETED,
            resource_type="chat_message",
            resource_id=message.id,
            remate_id=remate_id,
            details={"content_preview": message.content[:100]},
        )
        await self._repository.commit()
        await self._repository.refresh(message)
        await self._event_bus.publish(
            ChatMessageDeleted(remate_id=remate_id, message_id=message.id)
        )
        return message

    async def record_system_message(
        self,
        remate_id: uuid.UUID,
        content: str,
        *,
        system_event_type: str,
        source_event_id: uuid.UUID,
    ) -> ChatMessage | None:
        """Llamado únicamente por `ChatSystemEventDispatcher` (`realtime.py`), nunca por
        HTTP. Idempotente por `source_event_id` (ver `models.py`): en un despliegue
        multi-instancia, cada instancia reacciona al mismo evento de dominio -- la
        primera gana, las demás reciben `IntegrityError` contra el índice único parcial
        y devuelven la fila ya persistida sin publicar un segundo `ChatMessageSent`."""
        existing = await self._repository.get_by_source_event_id(source_event_id)
        if existing is not None:
            return existing

        message = ChatMessage(
            remate_id=remate_id,
            kind=ChatMessageKind.SYSTEM,
            content=content,
            system_event_type=system_event_type,
            source_event_id=source_event_id,
        )
        self._repository.add(message)
        try:
            await self._repository.commit()
        except IntegrityError:
            await self._repository.rollback()
            # Camino esperado: otra instancia ganó la carrera de idempotencia (ver
            # docstring de arriba) -- la fila ya existe, se devuelve sin loguear nada.
            # Si en cambio NO aparece (ej. `remate_id` no corresponde a ningún remate
            # real -- el índice único no es lo único que puede fallar acá), es una
            # anomalía genuina: se loguea para no perderla en silencio, pero igual no se
            # relanza (mismo contrato "nunca lanza" que el resto del pipeline de eventos).
            existing = await self._repository.get_by_source_event_id(source_event_id)
            if existing is None:
                logger.warning(
                    "chat_system_message_integrity_error_without_existing_row",
                    remate_id=str(remate_id),
                    source_event_id=str(source_event_id),
                )
            return existing

        await self._repository.refresh(message)
        await self._publish_sent(message)
        return message

    async def notify_typing(self, remate_id: uuid.UUID, user: User) -> None:
        """De mejor esfuerzo: si el usuario está mandando el aviso más rápido de lo que
        permite el límite, se descarta en silencio (no es un error del cliente, no
        rompe la experiencia -- a diferencia de `send_message`, donde superar el límite
        sí se informa)."""
        await self._remate_service.get_visible_or_raise(remate_id, user)

        allowed = await self._rate_limiter.check_and_increment(
            self._typing_rate_limit_key(remate_id, user.id),
            limit=1,
            window_seconds=self._settings.CHAT_TYPING_RATE_LIMIT_WINDOW_SECONDS,
        )
        if not allowed:
            return

        await self._event_bus.publish(
            ChatUserTyping(remate_id=remate_id, user_id=user.id, user_name=user.full_name)
        )

    async def list_recent(self, remate_id: uuid.UUID, viewer: User) -> list[ChatMessage]:
        await self._remate_service.get_visible_or_raise(remate_id, viewer)
        return await self._repository.list_recent(
            remate_id, limit=self._settings.CHAT_HISTORY_DEFAULT_LIMIT
        )

    async def list_before(
        self,
        remate_id: uuid.UUID,
        viewer: User,
        *,
        before_created_at: datetime,
        before_id: uuid.UUID,
    ) -> list[ChatMessage]:
        await self._remate_service.get_visible_or_raise(remate_id, viewer)
        return await self._repository.list_before(
            remate_id,
            before_created_at=before_created_at,
            before_id=before_id,
            limit=self._settings.CHAT_HISTORY_DEFAULT_LIMIT,
        )

    @staticmethod
    def _rate_limit_key(remate_id: uuid.UUID, user_id: uuid.UUID) -> str:
        return f"chat:ratelimit:messages:{remate_id}:{user_id}"

    @staticmethod
    def _typing_rate_limit_key(remate_id: uuid.UUID, user_id: uuid.UUID) -> str:
        return f"chat:ratelimit:typing:{remate_id}:{user_id}"

    async def _publish_sent(self, message: ChatMessage) -> None:
        await self._event_bus.publish(
            ChatMessageSent(
                remate_id=message.remate_id,
                message_id=message.id,
                kind=message.kind,
                author_id=message.author_id,
                author_name=message.author_name,
                author_role=message.author_role,
                content=message.content,
                system_event_type=message.system_event_type,
                created_at=message.created_at,
            )
        )
