/**
 * Tipos de los eventos de dominio sincronizados en tiempo real (Épica 4, Módulo 4.6) --
 * reflejan, campo por campo, `backend/app/realtime/registry.py::SYNCED_EVENTS` (12
 * clases, sin cambios en el backend): los 10 pedidos por la épica (`AuctionStarted` ->
 * `remate.started`, etc.) más `RemateCancelled`/`LoteCancelled`, ya sincronizados por el
 * Event Dispatcher del backend (Épica 3, Módulo 3.5).
 *
 * Cada uno es el `payload` de un `DomainEventWSMessage` (ver `messages.ts`) -- no el
 * envelope completo. Montos (`amount`, `final_price`, `new_amount`) son `string`, mismo
 * motivo que `Lote.base_price`/`OfertaSnapshotEntry.amount`
 * (`features/remates/types.ts`, `features/sala/types.ts`): Pydantic v2 serializa
 * `Decimal` preservando su representación exacta.
 */

interface DomainEventBase {
  event_id: string;
  remate_id: string;
  occurred_at: string;
}

export interface RemateStartedEvent extends DomainEventBase {
  event_type: 'remate.started';
}

export interface RematePausedEvent extends DomainEventBase {
  event_type: 'remate.paused';
}

export interface RemateResumedEvent extends DomainEventBase {
  event_type: 'remate.resumed';
}

export interface RemateFinishedEvent extends DomainEventBase {
  event_type: 'remate.finished';
  triggered_by: 'manual' | 'auto';
}

export interface RemateCancelledEvent extends DomainEventBase {
  event_type: 'remate.cancelled';
  reason: string;
}

export interface LoteOpenedEvent extends DomainEventBase {
  event_type: 'lote.opened';
  lote_id: string;
  lot_number: string;
  display_order: number;
}

export interface LoteClosedEvent extends DomainEventBase {
  event_type: 'lote.closed';
  lote_id: string;
  outcome: 'sold' | 'unsold';
  final_price: string | null;
}

export interface LoteCancelledEvent extends DomainEventBase {
  event_type: 'lote.cancelled';
  lote_id: string;
  reason: string;
}

/** Se publica ante cualquier intento de oferta, aceptada o no -- este módulo no lo usa
 * para actualizar la interfaz (el resultado definitivo llega vía `oferta.accepted`/
 * `oferta.rejected`), pero está tipado para que un consumidor futuro (por ejemplo, un
 * indicador de "alguien está ofertando") no necesite un tipo nuevo. */
export interface OfertaPlacedEvent extends DomainEventBase {
  event_type: 'oferta.placed';
  oferta_id: string;
  lote_id: string;
  buyer_id: string;
  amount: string;
  status: string;
}

export interface OfertaAcceptedEvent extends DomainEventBase {
  event_type: 'oferta.accepted';
  oferta_id: string;
  lote_id: string;
  buyer_id: string;
  amount: string;
}

/** `buyer_id` real (sin enmascarar) -- a diferencia del snapshot, el Event Dispatcher
 * del backend no aplica `SnapshotService._mask_oferta` a los eventos crudos (ver
 * ADR-031, sección sobre anonimato). El reducer (`reducer.ts`) nunca vuelca este campo a
 * la interfaz. */
export interface OfertaRejectedEvent extends DomainEventBase {
  event_type: 'oferta.rejected';
  oferta_id: string;
  lote_id: string;
  buyer_id: string;
  amount: string;
  reason: string;
}

export interface OfertaWinnerChangedEvent extends DomainEventBase {
  event_type: 'oferta.winner_changed';
  lote_id: string;
  previous_oferta_id: string;
  previous_buyer_id: string;
  new_oferta_id: string;
  new_buyer_id: string;
  new_amount: string;
}

/**
 * Presencia (Épica 6, Módulo 6.2) -- reflejan
 * `backend/app/presence/events.py::PresenceUserConnected`/`PresenceUserDisconnected`,
 * sincronizados por el mismo `EventDispatcher` sin ningún cambio (agregados a
 * `SYNCED_EVENTS` en `app/realtime/registry.py`). `connection_id` es imprescindible --
 * dos pestañas del mismo `user_id` son dos conexiones distintas (ver
 * `docs/21-sistema-de-salas.md`), así que el reducer indexa por `connection_id`, nunca
 * por `user_id` (ver `reducer.ts`).
 */
export interface PresenceUserConnectedEvent extends DomainEventBase {
  event_type: 'presencia.usuario_conectado';
  connection_id: string;
  user_id: string;
  connected_users: number;
}

export interface PresenceUserDisconnectedEvent extends DomainEventBase {
  event_type: 'presencia.usuario_desconectado';
  connection_id: string;
  user_id: string;
  connected_users: number;
}

export type SalaDomainEvent =
  | RemateStartedEvent
  | RematePausedEvent
  | RemateResumedEvent
  | RemateFinishedEvent
  | RemateCancelledEvent
  | LoteOpenedEvent
  | LoteClosedEvent
  | LoteCancelledEvent
  | OfertaPlacedEvent
  | OfertaAcceptedEvent
  | OfertaRejectedEvent
  | OfertaWinnerChangedEvent
  | PresenceUserConnectedEvent
  | PresenceUserDisconnectedEvent;
