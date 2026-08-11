"""Datos de una adjudicación, ya resueltos -- `PostAuctionService.create_case_from_winner`
ya tiene todo esto en memoria en el momento en que crea el caso, así que ningún canal de
notificación necesita volver a consultar la base."""

import uuid
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal


@dataclass(frozen=True)
class LoteAdjudicadoContext:
    case_id: uuid.UUID
    lote_id: uuid.UUID
    remate_id: uuid.UUID
    buyer_email: str
    buyer_name: str
    rematador_name: str
    remate_title: str
    lote_title: str
    lot_number: str
    final_price: Decimal
    currency: str
    adjudicated_at: datetime
