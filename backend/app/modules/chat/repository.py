"""Acceso a datos del módulo de chat (Épica 6, Módulo 6.4). Ver
docs/34-chat-del-remate.md y ADR-037.

`list_recent`/`list_before` **no** filtran `deleted_at IS NULL` -- a diferencia de
`Remate` (donde un soft-delete saca al registro de las listas por defecto), un mensaje
de chat eliminado sigue apareciendo en el historial (con su texto oculto por
`ChatMessageRead`, ver `schemas.py`), igual que cualquier chat conocido (Slack,
Discord): la moderación dejar constancia de que *algo* se dijo y fue removido, no
reescribe la conversación borrando la fila de la línea de tiempo.

Paginación **keyset**, no offset/limit (a diferencia de `OfertaRepository.list_by_lote`)
-- "miles de mensajes" con scroll infinito hacia atrás es exactamente el escenario
donde OFFSET se degrada (cada página más profunda escanea/descarta más filas). La
comparación es row-wise (`(created_at, id) < (:before_created_at, :before_id)`), no
solo por `created_at`: dos mensajes pueden compartir el mismo timestamp bajo
concurrencia, y comparar solo por `created_at` podría saltear o duplicar filas en el
borde exacto de un timestamp repetido.
"""

import uuid
from datetime import datetime

from sqlalchemy import select, tuple_
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.chat.models import ChatMessage


class ChatMessageRepository:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    def add(self, message: ChatMessage) -> None:
        self._db.add(message)

    async def commit(self) -> None:
        await self._db.commit()

    async def rollback(self) -> None:
        await self._db.rollback()

    async def refresh(self, message: ChatMessage) -> None:
        await self._db.refresh(message)

    async def get_by_id(self, message_id: uuid.UUID) -> ChatMessage | None:
        return await self._db.get(ChatMessage, message_id)

    async def get_by_source_event_id(self, source_event_id: uuid.UUID) -> ChatMessage | None:
        """Chequeo previo al `INSERT` (camino feliz) -- el índice único parcial sobre
        `source_event_id` es la garantía real de idempotencia (ver `models.py`), esto
        solo evita un `IntegrityError` innecesario en el caso común (sin condición de
        carrera) de que la propia instancia ya haya procesado este evento antes."""
        stmt = select(ChatMessage).where(ChatMessage.source_event_id == source_event_id)
        return (await self._db.execute(stmt)).scalar_one_or_none()

    async def list_recent(self, remate_id: uuid.UUID, *, limit: int) -> list[ChatMessage]:
        stmt = (
            select(ChatMessage)
            .where(ChatMessage.remate_id == remate_id)
            .order_by(ChatMessage.created_at.desc(), ChatMessage.id.desc())
            .limit(limit)
        )
        items = (await self._db.execute(stmt)).scalars().all()
        return list(reversed(items))  # cronológico (más antiguo primero)

    async def list_before(
        self,
        remate_id: uuid.UUID,
        *,
        before_created_at: datetime,
        before_id: uuid.UUID,
        limit: int,
    ) -> list[ChatMessage]:
        stmt = (
            select(ChatMessage)
            .where(
                ChatMessage.remate_id == remate_id,
                tuple_(ChatMessage.created_at, ChatMessage.id)
                < tuple_(before_created_at, before_id),
            )
            .order_by(ChatMessage.created_at.desc(), ChatMessage.id.desc())
            .limit(limit)
        )
        items = (await self._db.execute(stmt)).scalars().all()
        return list(reversed(items))  # cronológico (más antiguo primero)
