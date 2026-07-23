"""Schemas Pydantic del Timer Service. Las respuestas reusan `LoteRead`
(`app/modules/remates/lotes/schemas.py`) tal cual -- ver docs/40-cuenta-regresiva-y-cierre-automatico.md.
"""

from pydantic import BaseModel, Field


class TimerRemainingRequest(BaseModel):
    seconds: int = Field(ge=0, le=3600)


class TimerAutoCloseRequest(BaseModel):
    enabled: bool
