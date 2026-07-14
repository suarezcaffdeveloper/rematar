"""Catálogo de eventos de dominio de `Remate` (Épica 3, Módulo 3.2). Ver
docs/19-arquitectura-de-eventos.md.

Cada clase corresponde a una transición ya implementada de `RemateService`
(Módulos 2.1 y 2.3) — ninguna agrega una transición nueva, solo le da forma tipada al
hecho de que esa transición ya ocurrió.
"""

import uuid
from datetime import datetime
from typing import Literal

from app.events.base import RemateScopedEvent
from app.modules.remates.models import RemateCategory


class RemateCreated(RemateScopedEvent):
    event_type: Literal["remate.created"] = "remate.created"
    owner_id: uuid.UUID
    title: str
    category: RemateCategory


class RemateScheduled(RemateScopedEvent):
    event_type: Literal["remate.scheduled"] = "remate.scheduled"
    starts_at: datetime


class RemateStarted(RemateScopedEvent):
    event_type: Literal["remate.started"] = "remate.started"


class RematePaused(RemateScopedEvent):
    event_type: Literal["remate.paused"] = "remate.paused"


class RemateResumed(RemateScopedEvent):
    event_type: Literal["remate.resumed"] = "remate.resumed"


class RemateFinished(RemateScopedEvent):
    event_type: Literal["remate.finished"] = "remate.finished"
    # Distingue el `finish` manual (RemateService.finish) del automático al resolverse
    # el último lote (RemateService.try_auto_finish, RF-10) — ver ADR-019.
    triggered_by: Literal["manual", "auto"]


class RemateCancelled(RemateScopedEvent):
    event_type: Literal["remate.cancelled"] = "remate.cancelled"
    reason: str
