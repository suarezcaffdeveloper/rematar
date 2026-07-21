/**
 * Aplica un evento de dominio ya recibido por WebSocket sobre el estado en memoria de la
 * sala (Épica 4, Módulo 4.6). Funciones puras -- sin `useState` ni efectos acá, eso vive
 * en `hooks.ts::useLiveRemateState`. Ver `docs/28-websocket-tiempo-real-sala.md`,
 * "Manejo de eventos", para la explicación completa de cada caso.
 *
 * Principio general: cada evento actualiza ÚNICAMENTE la parte de `RemateStateSnapshot`
 * que le corresponde (pedido explícito del módulo, "evitar recargar toda la pantalla")
 * -- nunca se reconstruye el objeto completo, así que `React.memo` en
 * `OfferHistoryEntry`/`UpcomingLoteCard` (Módulo 4.5) sigue evitando el re-render de las
 * filas que no cambiaron.
 */

import type { Lote, LoteStatus } from '../../remates/types';
import type { OfertaSnapshotEntry, RemateStateSnapshot } from '../types';
import type { SalaDomainEvent } from './events';

/** Mismo tope que `SnapshotService.DEFAULT_RECENT_OFFERS_LIMIT` (backend) -- el panel
 * lateral ya documenta "ofertas recientes", nunca el total histórico (ver
 * `docs/27-sala-del-remate.md`); una oferta nueva agregada en vivo respeta el mismo
 * límite. */
const RECENT_OFFERS_LIMIT = 10;

function patchLote(lotes: Lote[], loteId: string, patch: Partial<Lote>): Lote[] {
  let changed = false;
  const next = lotes.map((lote) => {
    if (lote.id !== loteId) return lote;
    changed = true;
    return { ...lote, ...patch };
  });
  return changed ? next : lotes;
}

/** Actualiza el estado (y, si corresponde, `final_price`) del lote afectado dentro de
 * la lista completa de lotes (`useLotes`, reusado tal cual de `features/remates/`) --
 * de acá sale `upcomingLotes` en `hooks.ts`, por eso un lote recién abierto deja de
 * listarse entre "próximos" sin esperar a un nuevo fetch. */
export function applyDomainEventToLotes(lotes: Lote[], event: SalaDomainEvent): Lote[] {
  switch (event.event_type) {
    case 'lote.opened':
      return patchLote(lotes, event.lote_id, { status: 'open' });
    case 'lote.closed': {
      const status: LoteStatus = event.outcome === 'sold' ? 'closed_sold' : 'closed_unsold';
      return patchLote(lotes, event.lote_id, { status, final_price: event.final_price });
    }
    case 'lote.cancelled':
      return patchLote(lotes, event.lote_id, { status: 'cancelled' });
    default:
      return lotes;
  }
}

/** Construye la entrada de historial que corresponde a una oferta aceptada. `buyer_id`
 * se fuerza a `null` siempre -- el Event Dispatcher del backend reenvía el evento crudo
 * sin enmascarar (a diferencia del Snapshot Service), así que este es el único punto
 * donde el frontend re-aplica la misma política de anonimato entre postores que ya rige
 * el resto de la sala (`docs/27-sala-del-remate.md`, "Anonimato de compradores"; ver
 * ADR-031 para la justificación completa). */
function toOfertaSnapshotEntry(event: {
  oferta_id: string;
  amount: string;
  occurred_at: string;
}): OfertaSnapshotEntry {
  return {
    id: event.oferta_id,
    buyer_id: null,
    amount: event.amount,
    status: 'winning',
    created_at: event.occurred_at,
  };
}

/** Aplica un evento de dominio sobre el snapshot en memoria. `lotes` es la lista
 * completa ya cargada por `useLotes` -- necesaria porque `lote.opened` solo trae
 * `lote_id`/`lot_number`/`display_order` (no el lote completo: imágenes, atributos,
 * precios), así que reconstruir `active_lote` requiere buscarlo ahí. */
export function applyDomainEventToSnapshot(
  snapshot: RemateStateSnapshot,
  event: SalaDomainEvent,
  lotes: Lote[],
): RemateStateSnapshot {
  switch (event.event_type) {
    case 'remate.started':
      return { ...snapshot, remate: { ...snapshot.remate, status: 'live' } };

    case 'remate.paused':
      return { ...snapshot, remate: { ...snapshot.remate, status: 'paused' } };

    case 'remate.resumed':
      return { ...snapshot, remate: { ...snapshot.remate, status: 'live' } };

    case 'remate.finished':
      return {
        ...snapshot,
        remate: { ...snapshot.remate, status: 'finished', finished_at: event.occurred_at },
      };

    case 'remate.cancelled':
      return {
        ...snapshot,
        remate: {
          ...snapshot.remate,
          status: 'cancelled',
          cancellation_reason: event.reason,
          cancelled_at: event.occurred_at,
        },
      };

    case 'lote.opened': {
      const fullLote = lotes.find((lote) => lote.id === event.lote_id);
      if (!fullLote) return snapshot; // Todavía no llegó por `useLotes` -- el próximo snapshot (reconexión) reconcilia.
      return {
        ...snapshot,
        active_lote: { ...fullLote, status: 'open' },
        winning_offer: null,
        recent_offers: [],
      };
    }

    case 'lote.closed':
      if (snapshot.active_lote?.id !== event.lote_id) return snapshot;
      return { ...snapshot, active_lote: null };

    case 'lote.cancelled':
      if (snapshot.active_lote?.id !== event.lote_id) return snapshot;
      return { ...snapshot, active_lote: null };

    case 'oferta.accepted': {
      const entry = toOfertaSnapshotEntry(event);
      return {
        ...snapshot,
        winning_offer: entry,
        recent_offers: [entry, ...snapshot.recent_offers].slice(0, RECENT_OFFERS_LIMIT),
      };
    }

    case 'oferta.winner_changed':
      return {
        ...snapshot,
        recent_offers: snapshot.recent_offers.map((offer) =>
          offer.id === event.previous_oferta_id ? { ...offer, status: 'outbid' } : offer,
        ),
      };

    case 'presencia.usuario_conectado': {
      const detail = snapshot.connected_users_detail;
      // `null` para un viewer no privilegiado (enmascarado por el backend) -- se
      // mantiene `null`, solo cambia el conteo. Indexado por `connection_id`, no por
      // `user_id`: dos pestañas del mismo usuario son dos conexiones distintas.
      const nextDetail =
        detail === null
          ? null
          : detail.some((entry) => entry.connection_id === event.connection_id)
            ? detail
            : [
                ...detail,
                {
                  connection_id: event.connection_id,
                  user_id: event.user_id,
                  connected_at: event.occurred_at,
                },
              ];
      return { ...snapshot, connected_users: event.connected_users, connected_users_detail: nextDetail };
    }

    case 'presencia.usuario_desconectado': {
      const detail = snapshot.connected_users_detail;
      const nextDetail =
        detail === null ? null : detail.filter((entry) => entry.connection_id !== event.connection_id);
      return { ...snapshot, connected_users: event.connected_users, connected_users_detail: nextDetail };
    }

    // `oferta.placed`: el resultado definitivo llega vía `oferta.accepted`/
    // `oferta.rejected` -- no muta el snapshot por sí solo.
    // `oferta.rejected`: en este módulo `PlaceBidButton` sigue deshabilitado, así que
    // nunca corresponde a una oferta del usuario actual; se descarta para no filtrar a
    // los demás conectados el intento fallido de otro comprador
    // (`docs/06-eventos-del-sistema.md`, "notas de diseño").
    case 'oferta.placed':
    case 'oferta.rejected':
      return snapshot;

    default:
      // Evento sincronizado en el futuro que este módulo todavía no interpreta -- se
      // ignora (mismo criterio "whitelist" que el backend aplica en `registry.py`):
      // agregar un caso nuevo acá es una rama más de este switch, no una reestructuración.
      return snapshot;
  }
}
