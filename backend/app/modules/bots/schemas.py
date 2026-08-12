"""Schemas Pydantic del módulo de bots simuladores de compradores."""

import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.modules.bots.models import BotPersonality, BotSimulationStatus


class BotProfileBase(BaseModel):
    display_name: str = Field(min_length=1, max_length=100)
    personality: BotPersonality
    max_budget: Decimal = Field(gt=0, max_digits=14, decimal_places=2)
    reaction_delay_min_seconds: int = Field(gt=0)
    reaction_delay_max_seconds: int = Field(gt=0)
    continue_probability: Decimal = Field(ge=0, le=1, max_digits=3, decimal_places=2)
    participates_in_chat: bool = False
    chat_message_frequency: Decimal = Field(
        default=Decimal("0"), ge=0, le=1, max_digits=3, decimal_places=2
    )

    @model_validator(mode="after")
    def _reaction_window_is_valid(self) -> "BotProfileBase":
        if self.reaction_delay_max_seconds < self.reaction_delay_min_seconds:
            raise ValueError(
                "El tiempo de reacción máximo debe ser mayor o igual al mínimo."
            )
        return self


class BotProfileCreate(BotProfileBase):
    pass


class BotProfileUpdate(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=100)
    personality: BotPersonality | None = None
    max_budget: Decimal | None = Field(default=None, gt=0, max_digits=14, decimal_places=2)
    reaction_delay_min_seconds: int | None = Field(default=None, gt=0)
    reaction_delay_max_seconds: int | None = Field(default=None, gt=0)
    continue_probability: Decimal | None = Field(
        default=None, ge=0, le=1, max_digits=3, decimal_places=2
    )
    participates_in_chat: bool | None = None
    chat_message_frequency: Decimal | None = Field(
        default=None, ge=0, le=1, max_digits=3, decimal_places=2
    )
    is_active: bool | None = None


class BotProfileRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    display_name: str
    personality: BotPersonality
    max_budget: Decimal
    reaction_delay_min_seconds: int
    reaction_delay_max_seconds: int
    continue_probability: Decimal
    participates_in_chat: bool
    chat_message_frequency: Decimal
    is_active: bool


class BotSelectionSetRequest(BaseModel):
    bot_profile_ids: list[uuid.UUID] = Field(default_factory=list)


class BotRosterEntry(BaseModel):
    """Un bot seleccionado para un remate puntual -- forma mínima que el frontend
    necesita para pintar el checklist de selección y resolver `is_bot` en la consola
    del rematador (ver docstring de `app/snapshot/schemas.py::OfertaSnapshotEntry`)."""

    bot_profile_id: uuid.UUID
    user_id: uuid.UUID
    display_name: str
    is_enabled: bool


class BotSimulationRunRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    remate_id: uuid.UUID
    status: BotSimulationStatus
    started_at: datetime | None
    paused_at: datetime | None
    stopped_at: datetime | None
    stop_reason: str | None
