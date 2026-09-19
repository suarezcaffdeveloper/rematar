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



# Claves de tarjeta cruda que el Payment Brick JAMÁS produce (tokeniza todo dentro de su
# propio iframe) -- si aparecen acá es porque algo (o alguien) está mandando datos de
# tarjeta sin tokenizar directo a esta API, evitando el Brick por completo. Rechazarlas
# es defensa en profundidad, no una validación "normal": el frontend legítimo nunca
# dispara esto. Sin este chequeo, el endpoint queda técnicamente en condiciones de
# transportar un PAN/CVV crudo (aunque en la práctica nunca lo haga), lo que alcanza
# para que quede en alcance de PCI DSS como si pudiera manejarlos -- justo lo que
# `_require_token` no cubre por sí solo (solo exige que el token *esté*, no que los
# campos crudos *no estén*).
_RAW_CARD_DATA_KEYS = frozenset(
    {
        "card_number",
        "cardnumber",
        "security_code",
        "securitycode",
        "cvv",
        "cvc",
        "expiration_month",
        "expirationmonth",
        "expiration_year",
        "expirationyear",
    }
)


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

    @field_validator("card_payment_data")
    @classmethod
    def _reject_raw_card_data(cls, value: dict[str, Any]) -> dict[str, Any]:
        present = {key.lower() for key in value} & _RAW_CARD_DATA_KEYS
        if present:
            raise ValueError(
                "card_payment_data no debe incluir datos de tarjeta sin tokenizar "
                f"({', '.join(sorted(present))}). Usá el token que devuelve el Payment Brick."
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
