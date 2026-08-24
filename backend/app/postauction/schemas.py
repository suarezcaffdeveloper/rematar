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
from app.postauction.models import PostAuctionDocumentType, PostAuctionStatus


class PostAuctionDocumentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    document_type: PostAuctionDocumentType
    filename: str
    original_filename: str
    content_type: str
    file_size: int
    url: str
    uploaded_by_id: uuid.UUID | None
    created_at: datetime


class PostAuctionCaseRead(BaseModel):
    id: uuid.UUID
    lote_id: uuid.UUID
    lot_number: str
    lote_title: str
    lote_cover_image_url: str | None
    remate_id: uuid.UUID
    remate_title: str
    buyer_id: uuid.UUID
    buyer_name: str | None
    rematador_id: uuid.UUID
    rematador_name: str | None
    # Precio base del lote (`Lote.base_price`) -- lo carga `_build_read_and_buyer` de la
    # misma fila de `Lote` que ya resuelve `lot_number`/`lote_title`, mismo criterio
    # defensivo (`None` si el lote no resuelve).
    base_price: Decimal | None
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
    documents: list[PostAuctionDocumentRead]


class PostAuctionCaseRematadorRead(PostAuctionCaseRead):
    """Vista de una venta adjudicada para el rematador dueño (o un admin).

    Agrega el contacto del comprador (email/teléfono) -- solo se usa en los endpoints de
    `/postauction/ventas/...`, nunca en `/postauction/mis-compras/...` (ese lado usa
    `PostAuctionCaseRead`/`PostAuctionCaseDetail` sin estos campos): el comprador no debe
    ver el contacto del rematador, y el control de acceso de `list_for_rematador`/
    `_get_owned_case_or_raise` (service.py) ya garantiza que solo llegue al rematador
    dueño de esta venta puntual.
    """

    buyer_email: str | None
    buyer_phone: str | None


class PostAuctionCaseRematadorDetail(PostAuctionCaseRematadorRead):
    timeline: list[TimelineEntryRead]
    documents: list[PostAuctionDocumentRead]


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
    "PostAuctionCaseRematadorRead",
    "PostAuctionCaseRematadorDetail",
    "PostAuctionDocumentRead",
    "TimelineEntryRead",
    "StatusChangeRequest",
    "NoteCreateRequest",
    "PostAuctionListFilters",
]
