"""DTOs del Notification Service (Épica 7, Módulo 7.5). Ver
docs/41-gestion-post-remate.md y ADR-044."""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class NotificationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    created_at: datetime
    type: str
    title: str
    message: str
    resource_type: str | None
    resource_id: uuid.UUID | None
    remate_id: uuid.UUID | None
    read_at: datetime | None


class UnreadCountResponse(BaseModel):
    unread_count: int
