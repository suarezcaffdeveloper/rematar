"""Eventos de dominio del control de simulación de bots.

Deliberadamente livianos (sin `reason`/detalle salvo `BotSimulationStopped`): a
diferencia de `Oferta`/`ChatMessage`, no hay ninguna entidad nueva que el frontend deba
pintar a partir de estos eventos -- solo necesita saber que el estado de la simulación
cambió para refrescar los botones Iniciar/Pausar/Detener sin tener que hacer polling.
"""

from typing import Literal

from app.events.base import RemateScopedEvent


class BotSimulationStarted(RemateScopedEvent):
    event_type: Literal["bots.simulation_started"] = "bots.simulation_started"


class BotSimulationPaused(RemateScopedEvent):
    event_type: Literal["bots.simulation_paused"] = "bots.simulation_paused"


class BotSimulationStopped(RemateScopedEvent):
    event_type: Literal["bots.simulation_stopped"] = "bots.simulation_stopped"
    reason: str
