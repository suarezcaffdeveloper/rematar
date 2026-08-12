"""Catálogo de eventos de dominio de `Lote` (Épica 3, Módulo 3.2). Ver
docs/19-arquitectura-de-eventos.md.

`remate_id` (heredado de `RemateScopedEvent`) es lo que pone estos eventos en el mismo
canal que los de `Remate` y `Oferta` — ver ADR-022, sección C.

Los nueve eventos `LoteTimer*`/`LoteWinnerDetermined` (Épica 8, "cuenta regresiva y
cierre automático", ADR-007/ADR-043) implementan `lote.cierre_extendido` y la parte de
`lote.cerrado`/`lote.ganador_determinado` que el catálogo conceptual de Fase 0
(docs/06-eventos-del-sistema.md) ya reservaba sin construir.
"""

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Literal

from app.events.base import RemateScopedEvent


class LoteOpened(RemateScopedEvent):
    event_type: Literal["lote.opened"] = "lote.opened"
    lote_id: uuid.UUID
    lot_number: str
    display_order: int


class LoteClosed(RemateScopedEvent):
    event_type: Literal["lote.closed"] = "lote.closed"
    lote_id: uuid.UUID
    outcome: Literal["sold", "unsold"]
    final_price: Decimal | None
    # Distingue el cierre manual (`LoteService.close`) del automático al vencer el
    # timer (`LoteService.auto_close`, Épica 8) -- mismo patrón que
    # `RemateFinished.triggered_by` (app/modules/remates/events.py).
    triggered_by: Literal["manual", "auto"]


class LoteCancelled(RemateScopedEvent):
    event_type: Literal["lote.cancelled"] = "lote.cancelled"
    lote_id: uuid.UUID
    reason: str


class LoteRequeued(RemateScopedEvent):
    """Un lote `closed_unsold` volvió a `pending` al final de la cola (Módulo de lotes
    desiertos, `LoteService.requeue`) -- siempre disparado manualmente por el
    rematador, nunca automático. Trae las condiciones comerciales vigentes en la nueva
    ronda (iguales o editadas, ver `LoteRequeueRequest`) para que el reducer del
    frontend pueda parchear el lote sin pedirlo de nuevo por HTTP, mismo criterio que
    `LoteOpened`."""

    event_type: Literal["lote.requeued"] = "lote.requeued"
    lote_id: uuid.UUID
    lot_number: str
    display_order: int
    round_number: int
    base_price: Decimal
    min_increment: Decimal
    reserve_price: Decimal | None


class LoteWinnerDetermined(RemateScopedEvent):
    """Implementa `lote.ganador_determinado` (reservado desde Fase 0) -- publicado
    únicamente por `LoteService.auto_close` inmediatamente después de `LoteClosed`
    cuando el resultado es `sold`. El cierre manual (`close()`) no lo publica: el
    rematador declara un `final_price` sin comprador asociado (ADR-018) -- acá sí hay
    un comprador real porque el cierre automático adjudica a la oferta líder."""

    event_type: Literal["lote.winner_determined"] = "lote.winner_determined"
    lote_id: uuid.UUID
    oferta_id: uuid.UUID
    buyer_id: uuid.UUID
    amount: Decimal


class LoteTimerStarted(RemateScopedEvent):
    event_type: Literal["lote.timer_started"] = "lote.timer_started"
    lote_id: uuid.UUID
    ends_at: datetime
    duration_seconds: int


class LoteTimerPaused(RemateScopedEvent):
    event_type: Literal["lote.timer_paused"] = "lote.timer_paused"
    lote_id: uuid.UUID
    remaining_seconds: int


class LoteTimerResumed(RemateScopedEvent):
    event_type: Literal["lote.timer_resumed"] = "lote.timer_resumed"
    lote_id: uuid.UUID
    ends_at: datetime


class LoteTimerReset(RemateScopedEvent):
    event_type: Literal["lote.timer_reset"] = "lote.timer_reset"
    lote_id: uuid.UUID
    ends_at: datetime
    duration_seconds: int


class LoteTimerAdjusted(RemateScopedEvent):
    """El rematador fija un tiempo restante arbitrario (`TimerService.set_remaining`)
    -- distinto de `reset` (que siempre vuelve a la duración completa configurada).
    `ends_at` es `None` si el timer estaba pausado al momento del ajuste (no hay
    deadline absoluto mientras está pausado, solo `remaining_seconds`)."""

    event_type: Literal["lote.timer_adjusted"] = "lote.timer_adjusted"
    lote_id: uuid.UUID
    ends_at: datetime | None
    remaining_seconds: int


class LoteTimerAutoCloseToggled(RemateScopedEvent):
    event_type: Literal["lote.timer_auto_close_toggled"] = "lote.timer_auto_close_toggled"
    lote_id: uuid.UUID
    enabled: bool


class LoteTimerExtended(RemateScopedEvent):
    """Anti-sniping (ADR-007): una oferta aceptada dentro de la ventana configurada
    extendió el cierre. Publicado por `AuctionEngine.place_bid`, nunca por
    `LoteService` -- ver ADR-043, sección de por qué debe ser síncrono."""

    event_type: Literal["lote.timer_extended"] = "lote.timer_extended"
    lote_id: uuid.UUID
    ends_at: datetime
    extended_by_seconds: int


class LoteTimerExpired(RemateScopedEvent):
    """Publicado por `TimerExpiryScheduler` en cuanto detecta que el timer venció,
    antes de decidir/ejecutar la adjudicación (`LoteClosed`/`LoteWinnerDetermined`)."""

    event_type: Literal["lote.timer_expired"] = "lote.timer_expired"
    lote_id: uuid.UUID
