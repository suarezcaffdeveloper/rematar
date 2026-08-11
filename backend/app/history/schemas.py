"""DTOs del History Service (Épica 7, Módulo 7.3). Ver
docs/37-historial-y-resultados-de-remates.md y ADR-040.

Reutiliza literalmente `LoteStatusCounts`/`HighestOferta`/`TopLoteByOffers` de
`app/analytics/schemas.py` -- mismos campos que ya devuelve Analítica para un remate en
vivo, sin redefinirlos acá.
"""

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel

from app.analytics.schemas import HighestOferta, LoteStatusCounts, TopLoteByOffers
from app.common.schemas import Page
from app.modules.ofertas.models import OfertaStatus
from app.modules.remates.lotes.models import LoteStatus
from app.modules.remates.models import RemateCategory, RemateStatus

HistorySortOption = Literal[
    "date_desc", "date_asc", "title_asc", "title_desc", "amount_desc", "amount_asc"
]


class HistoryListFilters(BaseModel):
    """Filtros de `GET /history/remates` -- se arman a partir de los query params del
    router, mismo patrón que `AuditLogFilters` (`app/audit/schemas.py`)."""

    search: str | None = None
    date_from: datetime | None = None
    date_to: datetime | None = None
    sort: HistorySortOption = "date_desc"


class FinishedRemateSummary(BaseModel):
    """Una fila del listado de remates finalizados/cancelados -- KPIs agregados
    calculados en una única consulta (`HistoryRepository.list_finished_summaries`), sin
    N+1 por remate."""

    id: uuid.UUID
    title: str
    category: RemateCategory
    status: RemateStatus
    starts_at: datetime | None
    # `finished_at` si terminó normalmente, `cancelled_at` si se canceló -- la "fecha"
    # que pide el enunciado para este listado.
    resolved_at: datetime | None
    lote_count: int
    lotes_sold_count: int
    total_awarded_value: Decimal
    buyer_count: int
    duration_seconds: float | None
    owner_id: uuid.UUID
    owner_name: str | None


class ChatActivitySummary(BaseModel):
    """Resumen de actividad del chat de un remate -- solo mensajes `kind=user` (no
    cuenta los mensajes de sistema del ciclo de vida, Módulo 6.4)."""

    message_count: int
    deleted_count: int
    participant_count: int


class RemateHistoryDetail(BaseModel):
    remate_id: uuid.UUID
    title: str
    category: RemateCategory
    status: RemateStatus
    starts_at: datetime | None
    finished_at: datetime | None
    cancelled_at: datetime | None
    cancellation_reason: str | None
    duration_seconds: float | None

    # --- Métricas finales -- reutilizadas tal cual de AnalyticsRepository -------------
    lote_status_counts: LoteStatusCounts
    average_lote_duration_seconds: float | None
    total_awarded_value: Decimal
    total_ofertas: int
    highest_oferta: HighestOferta | None
    top_lote_by_offers: TopLoteByOffers | None

    # --- Actividad de chat y participantes --------------------------------------------
    chat_activity: ChatActivitySummary
    # Aproximación de "usuarios conectados durante el evento" -- Presencia es en memoria
    # (ADR-009, sin event store), no existe un historial real de conexiones. Se cuentan
    # los usuarios distintos que efectivamente interactuaron (ofertaron o escribieron en
    # el chat). Ver docs/37 y ADR-040 para el razonamiento completo.
    participants_count: int

    generated_at: datetime


class OfertaHistoryEntry(BaseModel):
    id: uuid.UUID
    buyer_id: uuid.UUID
    buyer_name: str | None
    amount: Decimal
    status: OfertaStatus
    rejection_reason: str | None
    created_at: datetime


class LoteWinner(BaseModel):
    buyer_id: uuid.UUID
    buyer_name: str | None
    # Contacto del ganador -- solo tiene sentido acá porque este endpoint ya está
    # restringido a dueño-o-admin (`_get_finished_remate_or_raise` en service.py), igual
    # que `PostAuctionCaseRematadorRead` en `app/postauction/schemas.py` para el mismo
    # propósito (contactar al ganador post-remate).
    buyer_email: str | None
    buyer_phone: str | None
    amount: Decimal


class LoteHistoryDetail(BaseModel):
    id: uuid.UUID
    remate_id: uuid.UUID
    lot_number: str
    title: str
    category: RemateCategory
    status: LoteStatus
    base_price: Decimal
    final_price: Decimal | None
    # Nulo si el lote no se vendió, o si se marcó vendido sin que exista una oferta
    # ACCEPTED real para atribuirle un comprador (ADR-018: el resultado de un cierre lo
    # declara el rematador, no necesariamente hay ofertas de por medio).
    winner: LoteWinner | None
    offer_count: int
    time_open_seconds: float | None
    opened_at: datetime | None
    closed_at: datetime | None
    cancellation_reason: str | None
    offer_history: Page[OfertaHistoryEntry]
