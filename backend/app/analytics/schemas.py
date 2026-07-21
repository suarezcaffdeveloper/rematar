"""DTOs del Analytics Service (Épica 7, Módulo 7.1). Ver
docs/35-dashboard-analitica-tiempo-real.md.

`RawAnalyticsAggregates` es la parte cacheable (todo lo derivado de Postgres, sin
Presencia -- mismo criterio que `RawRemateState` en `app/snapshot/schemas.py`).
`RemateAnalyticsSnapshot` es la respuesta final, siempre construida con datos frescos
de Presencia (nunca cacheados, ver `AnalyticsService`).
"""

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.modules.ofertas.models import OfertaStatus


class LoteStatusCounts(BaseModel):
    pending: int
    open: int
    closed_sold: int
    closed_unsold: int
    cancelled: int
    total: int


class HighestOferta(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    oferta_id: uuid.UUID
    lote_id: uuid.UUID
    lot_number: str
    lote_title: str
    buyer_id: uuid.UUID
    amount: Decimal
    status: OfertaStatus
    created_at: datetime


class TopLoteByOffers(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    lote_id: uuid.UUID
    lot_number: str
    lote_title: str
    offer_count: int


class BidsTimelineBucket(BaseModel):
    bucket_start: datetime
    count: int


RecentAnalyticsEventType = Literal[
    "lote.opened",
    "lote.closed_sold",
    "lote.closed_unsold",
    "remate.finished",
    "remate.cancelled",
]


class RecentAnalyticsEvent(BaseModel):
    event_type: RecentAnalyticsEventType
    occurred_at: datetime
    lote_id: uuid.UUID | None = None
    lot_number: str | None = None
    lote_title: str | None = None
    final_price: Decimal | None = None


class RawAnalyticsAggregates(BaseModel):
    """Forma cacheable en Redis del recorte de estado que sale de consultar la base --
    separada de `RemateAnalyticsSnapshot` porque los conteos de Presencia nunca se
    cachean (ya son lecturas en memoria, baratas, y deben verse instantáneas)."""

    lote_status_counts: LoteStatusCounts
    average_lote_duration_seconds: float | None
    total_awarded_value: Decimal
    total_ofertas: int
    ofertas_last_minute: int
    highest_oferta: HighestOferta | None
    top_lote_by_offers: TopLoteByOffers | None
    bids_timeline: list[BidsTimelineBucket] = Field(default_factory=list)
    recent_events: list[RecentAnalyticsEvent] = Field(default_factory=list)


class RemateAnalyticsSnapshot(BaseModel):
    """Lo que efectivamente recibe `GET /remates/{id}/analytics` -- solo dueño del
    remate o admin (ver `AnalyticsService.build`, sin vista parcial para nadie más)."""

    schema_version: int = Field(default=1)
    remate_id: uuid.UUID
    connected_users_total: int
    connected_buyers: int
    lote_status_counts: LoteStatusCounts
    average_lote_duration_seconds: float | None
    total_awarded_value: Decimal
    total_ofertas: int
    ofertas_per_minute: int
    highest_oferta: HighestOferta | None
    top_lote_by_offers: TopLoteByOffers | None
    bids_timeline: list[BidsTimelineBucket]
    recent_events: list[RecentAnalyticsEvent]
    generated_at: datetime
