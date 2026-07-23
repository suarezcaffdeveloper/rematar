"""Catálogo de eventos de dominio del PostAuction Service (Épica 7, Módulo 7.5). Ver
docs/41-gestion-post-remate.md y ADR-044.

`RemateScopedEvent` (mismo canal Redis que Remate/Lote/Oferta/Chat, ver
`app/events/base.py`) -- para que, si un usuario ya tiene la sala de ese remate abierta,
vea la actualización en vivo reutilizando el pipeline WebSocket existente
(`app/realtime/registry.py`) sin que este módulo conozca ese pipeline en absoluto.
"""

import uuid
from typing import Literal

from app.events.base import RemateScopedEvent


class PostAuctionCaseCreated(RemateScopedEvent):
    event_type: Literal["postauction.case_created"] = "postauction.case_created"
    case_id: uuid.UUID
    lote_id: uuid.UUID
    buyer_id: uuid.UUID


class PostAuctionStatusChanged(RemateScopedEvent):
    event_type: Literal["postauction.status_changed"] = "postauction.status_changed"
    case_id: uuid.UUID
    lote_id: uuid.UUID
    previous_status: str
    new_status: str
