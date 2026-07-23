"""DTOs del PostAuction Service (Épica 7, Módulo 7.5). Ver
docs/41-gestion-post-remate.md y ADR-044.

`PostAuctionCaseRead` no usa `ConfigDict(from_attributes=True)` sobre el ORM directo --
mismo criterio que `HistoryService` (`app/history/schemas.py`/`service.py`): `lote_id`/
`buyer_id`/`rematador_id` son FKs simples sin `relationship()`, así que el nombre/número
de lote y el nombre del comprador/rematador se resuelven aparte (`UserRepository`/
`LoteRepository`) y se arma el DTO a mano en `service.py`, nunca vía `model_validate` de
la fila sola.
"""

import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.common.schemas import Page
from app.postauction.models import PostAuctionStatus


class PostAuctionCaseRead(BaseModel):
    id: uuid.UUID
    lote_id: uuid.UUID
    lot_number: str
    lote_title: str
    remate_id: uuid.UUID
    remate_title: str
    buyer_id: uuid.UUID
    buyer_name: str | None
    rematador_id: uuid.UUID
    rematador_name: str | None
    final_price: Decimal
    status: PostAuctionStatus
    contacted_at: datetime | None
    payment_at: datetime | None
    shipped_at: datetime | None
    delivered_at: datetime | None
    finalized_at: datetime | None
    notes: str | None
    created_at: datetime
    updated_at: datetime


class TimelineEntryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    occurred_at: datetime
    actor_id: uuid.UUID | None
    actor_name: str | None
    actor_role: str | None
    action: str
    previous_status: PostAuctionStatus | None
    new_status: PostAuctionStatus | None
    note: str | None


class PostAuctionCaseDetail(PostAuctionCaseRead):
    timeline: list[TimelineEntryRead]


class StatusChangeRequest(BaseModel):
    new_status: PostAuctionStatus
    note: str | None = Field(default=None, max_length=2000)
    # Permite backdatear la fecha hito (ej. "el pago llegó ayer") -- si no se envía, se
    # usa el momento del pedido. Ver `STATUS_MILESTONE_FIELD` en `state_machine.py`.
    occurred_at: datetime | None = None


class NoteCreateRequest(BaseModel):
    note: str = Field(min_length=1, max_length=2000)


class PostAuctionListFilters(BaseModel):
    status: PostAuctionStatus | None = None
    remate_id: uuid.UUID | None = None
    search: str | None = None


__all__ = [
    "Page",
    "PostAuctionCaseRead",
    "PostAuctionCaseDetail",
    "TimelineEntryRead",
    "StatusChangeRequest",
    "NoteCreateRequest",
    "PostAuctionListFilters",
]
