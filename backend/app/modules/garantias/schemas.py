"""DTOs de la Garantía Económica.

`GarantiaRead` usa `ConfigDict(from_attributes=True)` directo sobre `Garantia` (a
diferencia de `PostAuctionCaseRead`): no hay nombres a resolver de otra tabla, todos sus
campos viven en la fila misma. A propósito NO expone `mp_payment_id`/`mp_status`
(identificadores/estado crudo del proveedor, sin valor para el comprador y superficie
innecesaria) -- ver el plan, sección Frontend."""

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.modules.garantias.models import GarantiaStatus


class GarantiaCreateRequest(BaseModel):
    # Tal cual lo arma el Payment Brick de Mercado Pago en el frontend (`token`,
    # `payment_method_id`, `issuer_id`, `installments`, `payer`, ...) -- este backend
    # nunca ve ni valida un número de tarjeta crudo, solo reenvía lo que ya tokenizó el
    # navegador (ver `GarantiaService.create_or_retry`, que sobrescribe `payer.email`
    # con el del comprador autenticado antes de mandarlo a Mercado Pago).
    card_payment_data: dict[str, Any] = Field(...)

    @field_validator("card_payment_data")
    @classmethod
    def _require_token(cls, value: dict[str, Any]) -> dict[str, Any]:
        if not value.get("token"):
            raise ValueError(
                "card_payment_data debe incluir el token generado por el Payment Brick."
            )
        return value


class GarantiaRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    remate_id: uuid.UUID
    status: GarantiaStatus
    amount: Decimal
    currency: str
    expires_at: datetime | None
    failure_reason: str | None
    created_at: datetime
