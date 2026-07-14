"""Catálogo de eventos de dominio de `Lote` (Épica 3, Módulo 3.2). Ver
docs/19-arquitectura-de-eventos.md.

`remate_id` (heredado de `RemateScopedEvent`) es lo que pone estos eventos en el mismo
canal que los de `Remate` y `Oferta` — ver ADR-022, sección C.
"""

import uuid
from decimal import Decimal
from typing import Literal

from app.events.base import RemateScopedEvent


class LoteOpened(RemateScopedEvent):
    event_type: Literal["lote.opened"] = "lote.opened"
    lote_id: uuid.UUID
    lot_number: str
    display_order: int


class LoteClosed(RemateScopedEvent):
    event_type: Literal["lote.closed"] = "lote.closed"
    lote_id: uuid.UUID
    outcome: Literal["sold", "unsold"]
    final_price: Decimal | None


class LoteCancelled(RemateScopedEvent):
    event_type: Literal["lote.cancelled"] = "lote.cancelled"
    lote_id: uuid.UUID
    reason: str
