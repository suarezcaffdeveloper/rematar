"""Schemas Pydantic del módulo de ofertas. Ver docs/17-auction-engine.md."""

import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.modules.ofertas.models import OfertaStatus


class OfertaCreate(BaseModel):
    amount: Decimal = Field(gt=0, max_digits=14, decimal_places=2)
    # Idempotencia (ADR-020, sección D) — opcional: un cliente HTTP simple puede omitirlo,
    # uno que necesite reintentar sin duplicar (o el futuro cliente de WebSocket) lo provee.
    client_token: str | None = Field(default=None, min_length=1, max_length=100)


class OfertaRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    lote_id: uuid.UUID
    buyer_id: uuid.UUID
    amount: Decimal
    status: OfertaStatus
    rejection_reason: str | None
    created_at: datetime
    updated_at: datetime


class LeadingOfferRead(BaseModel):
    """Respuesta mínima de `GET .../ofertas/leading` — deliberadamente sin `buyer_id`:
    es visible para cualquiera que pueda ver el lote (incluido cualquier comprador), así
    que no expone la identidad de quien está ofertando, solo el monto a superar."""

    amount: Decimal | None
