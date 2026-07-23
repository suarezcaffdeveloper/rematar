"""Schemas Pydantic del módulo de remates.

Ver docs/14-modulo-remate.md para la justificación completa de qué campo es obligatorio
y cuál opcional. En resumen: `title` y `category` son obligatorios siempre (identidad
mínima del remate); `starts_at` es opcional al crear pero obligatorio para programar
(`RemateService.schedule`); el resto (`description`, `cover_image_url`, `location`,
`ends_at`) es opcional siempre.
"""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, field_validator, model_validator

from app.modules.remates.models import RemateCategory, RemateStatus


class RemateSettings(BaseModel):
    """Ver ADR-012: esto es lo que se persiste en `remates.settings` (JSONB)."""

    anti_sniping_enabled: bool = False
    # Segundos que se extiende el cierre de un lote ante una oferta de último momento
    # (ADR-007 de Fase 0, implementado en ADR-043). Solo tiene efecto si
    # anti_sniping_enabled es true -- mismo número sirve de umbral de disparo ("oferta
    # dentro de los últimos N segundos") y de segundos a extender.
    anti_sniping_extension_seconds: int = Field(default=60, ge=10, le=600)
    # Código ISO 4217 de 3 letras, ej. "ARS", "USD".
    currency: str = Field(default="ARS")
    # Cuenta regresiva por lote (Épica 8, "cuenta regresiva y cierre automático",
    # ADR-043) -- `None` es "sin timer" para este remate, opt-in explícito.
    lote_timer_seconds: int | None = Field(default=None, ge=5, le=3600)

    @field_validator("currency")
    @classmethod
    def _normalize_currency(cls, value: str) -> str:
        normalized = value.strip().upper()
        if len(normalized) != 3 or not normalized.isalpha():
            raise ValueError("currency debe ser un código de 3 letras (ISO 4217), ej. 'ARS'.")
        return normalized


class _RemateDateValidationMixin:
    """`starts_at`/`ends_at` viven en más de un schema (Create y Update); esta
    validación de orden de fechas es la misma en ambos, así que se factoriza acá en vez
    de duplicar el `model_validator` dos veces."""

    @staticmethod
    def _check_date_order(starts_at: datetime | None, ends_at: datetime | None) -> None:
        if starts_at and ends_at and ends_at <= starts_at:
            raise ValueError("ends_at debe ser posterior a starts_at.")


class RemateCreate(BaseModel, _RemateDateValidationMixin):
    title: str = Field(min_length=3, max_length=200)
    category: RemateCategory
    description: str | None = Field(default=None, max_length=5000)
    cover_image_url: HttpUrl | None = None
    location: str | None = Field(default=None, max_length=255)
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    settings: RemateSettings = Field(default_factory=RemateSettings)

    @model_validator(mode="after")
    def _validate_dates(self) -> "RemateCreate":
        self._check_date_order(self.starts_at, self.ends_at)
        return self


class RemateUpdate(BaseModel, _RemateDateValidationMixin):
    """PATCH parcial: todos los campos son opcionales acá a nivel de *transporte* (si no
    se envían, no se tocan) — no confundir con qué campos son opcionales a nivel de
    *dominio* (eso lo define `Remate` en el modelo ORM). `RemateService.update` usa
    `model_dump(exclude_unset=True)` para distinguir "no lo mandaron" de "lo mandaron en
    null"."""

    title: str | None = Field(default=None, min_length=3, max_length=200)
    category: RemateCategory | None = None
    description: str | None = Field(default=None, max_length=5000)
    cover_image_url: HttpUrl | None = None
    location: str | None = Field(default=None, max_length=255)
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    settings: RemateSettings | None = None

    @model_validator(mode="after")
    def _validate_dates(self) -> "RemateUpdate":
        # Esta validación solo alcanza a los campos que vienen juntos en el mismo PATCH;
        # la validación contra el valor ya persistido de la fecha que no se está
        # actualizando ocurre en RemateService.update, que sí conoce el estado en base.
        if "starts_at" in self.model_fields_set and "ends_at" in self.model_fields_set:
            self._check_date_order(self.starts_at, self.ends_at)
        return self


class RemateCancelRequest(BaseModel):
    # Motivo de la cancelación (RF-11, obligatorio).
    reason: str = Field(min_length=3, max_length=500)


class RemateRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    owner_id: uuid.UUID
    title: str
    description: str | None
    category: RemateCategory
    cover_image_url: str | None
    location: str | None
    starts_at: datetime | None
    ends_at: datetime | None
    status: RemateStatus
    settings: RemateSettings
    cancellation_reason: str | None
    cancelled_at: datetime | None
    finished_at: datetime | None
    created_at: datetime
    updated_at: datetime
