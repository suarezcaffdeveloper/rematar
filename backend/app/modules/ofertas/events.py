"""Catálogo de eventos de dominio de `Oferta` (Épica 3, Módulo 3.2). Ver
docs/19-arquitectura-de-eventos.md y ADR-022 (sección de alternativas, sobre por qué
`OfertaPlaced`, `OfertaAccepted`/`OfertaRejected` y `OfertaWinnerChanged` son eventos
separados en vez de uno solo).
"""

import uuid
from decimal import Decimal
from typing import Literal

from app.events.base import RemateScopedEvent
from app.modules.ofertas.models import OfertaStatus


class OfertaPlaced(RemateScopedEvent):
    """Se publica siempre que `AuctionEngine.place_bid` persiste una fila — aceptada o
    rechazada. Señal agnóstica al resultado, para consumidores que solo necesitan saber
    "hubo un intento de oferta" (ej. métricas), sin importar en qué terminó."""

    event_type: Literal["oferta.placed"] = "oferta.placed"
    oferta_id: uuid.UUID
    lote_id: uuid.UUID
    buyer_id: uuid.UUID
    amount: Decimal
    status: OfertaStatus


class OfertaAccepted(RemateScopedEvent):
    event_type: Literal["oferta.accepted"] = "oferta.accepted"
    oferta_id: uuid.UUID
    lote_id: uuid.UUID
    buyer_id: uuid.UUID
    amount: Decimal


class OfertaRejected(RemateScopedEvent):
    event_type: Literal["oferta.rejected"] = "oferta.rejected"
    oferta_id: uuid.UUID
    lote_id: uuid.UUID
    buyer_id: uuid.UUID
    amount: Decimal
    reason: str


class OfertaWinnerChanged(RemateScopedEvent):
    """Se publica cuando una oferta aceptada supera a una vigente anterior — la señal
    específica que un futuro consumidor va a usar para notificarle "fuiste superado" al
    comprador anterior, distinta de "tu oferta fue aceptada" para el nuevo líder."""

    event_type: Literal["oferta.winner_changed"] = "oferta.winner_changed"
    lote_id: uuid.UUID
    previous_oferta_id: uuid.UUID
    previous_buyer_id: uuid.UUID
    new_oferta_id: uuid.UUID
    new_buyer_id: uuid.UUID
    new_amount: Decimal
