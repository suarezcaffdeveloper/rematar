"""Schemas Pydantic del módulo de chat (Épica 6, Módulo 6.4). Ver
docs/34-chat-del-remate.md.

`ChatMessageCreate` solo valida la forma estructural del mensaje (no vacío tras
`strip()`) -- la longitud máxima es un límite de negocio *configurable*
(`settings.CHAT_MESSAGE_MAX_LENGTH`), y los límites configurables se validan en la
capa de servicio en todo el proyecto, no en el schema (mismo criterio que
`MAX_IMAGE_UPLOAD_BYTES`, validado en `app/modules/remates/lotes/media_storage.py`, no
en un `Field` de Pydantic).
"""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, field_validator, model_validator

from app.modules.chat.models import ChatMessageKind


class ChatMessageCreate(BaseModel):
    content: str

    @field_validator("content")
    @classmethod
    def content_must_not_be_blank(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("El mensaje no puede estar vacío.")
        return stripped


class ChatMessageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    remate_id: uuid.UUID
    kind: ChatMessageKind
    author_id: uuid.UUID | None
    author_name: str | None
    author_role: str | None
    content: str | None
    system_event_type: str | None
    is_deleted: bool
    created_at: datetime

    @model_validator(mode="after")
    def _hide_content_when_deleted(self) -> "ChatMessageRead":
        """Un mensaje eliminado nunca expone su texto -- `content: null` +
        `is_deleted: true`. El backend no manda un placeholder de texto ("Mensaje
        eliminado"): ese copy es decisión del frontend, no un dato de negocio."""
        if self.is_deleted:
            self.content = None
        return self
