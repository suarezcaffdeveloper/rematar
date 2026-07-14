"""Schemas Pydantic del módulo de lotes.

Ver docs/15-modulo-lote.md para la justificación completa de qué campo es obligatorio y
cuál opcional. `images`/`documents` y `attributes` siguen el mismo patrón de
Remate.settings (JSONB validado en el borde, ver ADR-012/ADR-014): acá se definen los
sub-schemas que le dan forma a esas listas/diccionarios antes de persistirlos.
"""

import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, field_validator, model_validator

from app.modules.remates.lotes.models import LoteStatus
from app.modules.remates.models import RemateCategory

AttributeValue = str | int | float | bool

_MAX_ATTRIBUTES = 30
_MAX_ATTRIBUTE_KEY_LENGTH = 100


def _validate_attributes(value: dict[str, AttributeValue]) -> dict[str, AttributeValue]:
    if len(value) > _MAX_ATTRIBUTES:
        raise ValueError(f"No se permiten más de {_MAX_ATTRIBUTES} atributos por lote.")
    for key in value:
        if not key or len(key) > _MAX_ATTRIBUTE_KEY_LENGTH:
            raise ValueError(
                f"Las claves de atributos deben tener entre 1 y {_MAX_ATTRIBUTE_KEY_LENGTH} "
                "caracteres."
            )
    return value


class LoteImage(BaseModel):
    url: HttpUrl
    order: int = Field(default=0, ge=0)
    caption: str | None = Field(default=None, max_length=255)


class LoteDocument(BaseModel):
    url: HttpUrl
    title: str = Field(min_length=1, max_length=200)
    document_type: str | None = Field(default=None, max_length=100)


class _LotePriceValidationMixin:
    """`base_price`/`reserve_price` viven en Create y Update; la validación de que la
    reserva no sea menor al precio base es la misma en ambos (mismo patrón que
    `_RemateDateValidationMixin` en `remates/schemas.py`)."""

    @staticmethod
    def _check_reserve_price(base_price: Decimal | None, reserve_price: Decimal | None) -> None:
        if base_price is not None and reserve_price is not None and reserve_price < base_price:
            raise ValueError("El precio de reserva no puede ser menor al precio base.")


class LoteCreate(BaseModel, _LotePriceValidationMixin):
    lot_number: str = Field(min_length=1, max_length=20)
    title: str = Field(min_length=3, max_length=200)
    description: str | None = Field(default=None, max_length=5000)
    category: RemateCategory
    attributes: dict[str, AttributeValue] = Field(default_factory=dict)
    images: list[LoteImage] = Field(default_factory=list)
    documents: list[LoteDocument] = Field(default_factory=list)
    quantity: int = Field(default=1, ge=1)
    unit_label: str | None = Field(default=None, max_length=50)
    base_price: Decimal = Field(gt=0, max_digits=14, decimal_places=2)
    min_increment: Decimal = Field(gt=0, max_digits=14, decimal_places=2)
    reserve_price: Decimal | None = Field(default=None, gt=0, max_digits=14, decimal_places=2)

    @field_validator("attributes")
    @classmethod
    def _validate_attributes_field(
        cls, value: dict[str, AttributeValue]
    ) -> dict[str, AttributeValue]:
        return _validate_attributes(value)

    @model_validator(mode="after")
    def _validate_prices(self) -> "LoteCreate":
        self._check_reserve_price(self.base_price, self.reserve_price)
        return self


class LoteUpdate(BaseModel, _LotePriceValidationMixin):
    """PATCH parcial: todos los campos opcionales a nivel de *transporte* (mismo criterio
    que `RemateUpdate`). No incluye `display_order` (solo se cambia vía `reorder`, ver
    ADR-015) ni `status` (sin transiciones expuestas en este módulo)."""

    lot_number: str | None = Field(default=None, min_length=1, max_length=20)
    title: str | None = Field(default=None, min_length=3, max_length=200)
    description: str | None = Field(default=None, max_length=5000)
    category: RemateCategory | None = None
    attributes: dict[str, AttributeValue] | None = None
    images: list[LoteImage] | None = None
    documents: list[LoteDocument] | None = None
    quantity: int | None = Field(default=None, ge=1)
    unit_label: str | None = Field(default=None, max_length=50)
    base_price: Decimal | None = Field(default=None, gt=0, max_digits=14, decimal_places=2)
    min_increment: Decimal | None = Field(default=None, gt=0, max_digits=14, decimal_places=2)
    reserve_price: Decimal | None = Field(default=None, gt=0, max_digits=14, decimal_places=2)

    @field_validator("attributes")
    @classmethod
    def _validate_attributes_field(
        cls, value: dict[str, AttributeValue] | None
    ) -> dict[str, AttributeValue] | None:
        return value if value is None else _validate_attributes(value)

    @model_validator(mode="after")
    def _validate_prices(self) -> "LoteUpdate":
        # Igual que RemateUpdate: esta validación solo alcanza a los campos que vienen
        # juntos en el mismo PATCH. Contra el valor ya persistido del campo que no se
        # está actualizando, valida LoteService.update (que sí conoce el estado en base).
        fields_set = self.model_fields_set
        if "base_price" in fields_set or "reserve_price" in fields_set:
            self._check_reserve_price(self.base_price, self.reserve_price)
        return self


class LoteReorderRequest(BaseModel):
    """Lista completa y ordenada de `id` de los lotes vigentes del remate — ver
    ADR-015. `LoteService.reorder` valida que sea exactamente el conjunto actual."""

    lote_ids: list[uuid.UUID] = Field(min_length=1)


class LoteRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    remate_id: uuid.UUID
    lot_number: str
    display_order: int
    title: str
    description: str | None
    category: RemateCategory
    attributes: dict[str, AttributeValue]
    images: list[LoteImage]
    documents: list[LoteDocument]
    quantity: int
    unit_label: str | None
    base_price: Decimal
    min_increment: Decimal
    # None para compradores (ADR-016), aunque el valor persistido no sea nulo.
    reserve_price: Decimal | None
    status: LoteStatus
    created_at: datetime
    updated_at: datetime
