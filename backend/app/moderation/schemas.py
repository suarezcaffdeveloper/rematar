"""DTOs del Moderation Service (Épica 7, Módulo 7.6). Ver
docs/42-moderacion-en-tiempo-real.md y ADR-045.

`ModerationHistoryEntry` reutiliza literalmente `AuditLogEntryRead`
(`app/audit/schemas.py`) -- el "historial reciente de acciones" del panel de moderación
no es más que una vista filtrada del Audit Log ya existente, ver `service.py::
list_recent_actions`.
"""

import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.audit.schemas import AuditLogEntryRead

# Código de error del protocolo de salas para un usuario baneado -- vive acá (no en
# `app/websocket/rooms.py`) porque ese archivo debe permanecer sin conocimiento de
# dominio (ver su propio docstring). Mismo estilo que `ERROR_ALREADY_IN_ROOM`.
ERROR_BANNED_FROM_ROOM = "banned_from_room"

ModerationHistoryEntry = AuditLogEntryRead


class KickRequest(BaseModel):
    user_id: uuid.UUID
    reason: str | None = Field(default=None, max_length=500)


class MuteRequest(BaseModel):
    user_id: uuid.UUID
    duration_seconds: int = Field(gt=0, le=3600)


class LockChatRequest(BaseModel):
    duration_seconds: int = Field(gt=0, le=3600)


class ConnectedBuyerRead(BaseModel):
    user_id: uuid.UUID
    full_name: str | None
    connected_at: datetime
    is_muted: bool


class PinnedMessageRead(BaseModel):
    message_id: uuid.UUID
    content: str | None
    author_name: str | None
    pinned_by: uuid.UUID | None
    pinned_at: datetime
