/**
 * Reducer puro del feature de sala Timed -- mantiene el monto líder de CADA lote
 * (`Record<loteId, amount | null>`), no de "el lote activo" como
 * `features/sala/realtime/reducer.ts` (LIVE, un único lote a la vez). Se necesita este
 * archivo aparte, no un ajuste sobre ese reducer: `applyDomainEventToSnapshot` da por
 * sentado que `RemateStateSnapshot.active_lote` es el único lote relevante en cualquier
 * momento (ignora silenciosamente eventos de cualquier otro lote) -- exactamente lo que
 * NO vale en Timed, donde todos los lotes están abiertos en paralelo.
 *
 * Reusa `SalaDomainEvent` (mismo catálogo de eventos, mismo canal WebSocket -- una sala
 * por remate, ver `docs/21-sistema-de-salas.md`) sin ningún cambio de backend.
 */

import type { SalaDomainEvent } from '../sala/realtime/events';

export type LeadingAmountsByLote = Record<string, string | null>;

/** Aplica un evento de dominio sobre el mapa de montos líderes -- solo toca la entrada
 * del lote que corresponde (`event.lote_id`), nunca las demás. Eventos que no afectan
 * el precio (timers, presencia, apertura/cancelación de lote) se ignoran acá; el
 * status/timer del lote en sí lo sigue actualizando `applyDomainEventToLotes`
 * (`features/sala/realtime/reducer.ts`, ya agnóstico a la modalidad, reusado tal
 * cual). */
export function applyDomainEventToLeadingAmounts(
  amounts: LeadingAmountsByLote,
  event: SalaDomainEvent,
): LeadingAmountsByLote {
  switch (event.event_type) {
    case 'oferta.accepted':
      return { ...amounts, [event.lote_id]: event.amount };
    case 'lote.closed':
      // `unsold`: el monto líder (si lo hubo) se sigue mostrando -- el lote ya cerrado
      // muestra "Finalizado" con el último precio conocido, no un guion. `sold`: el
      // `final_price` reemplaza cualquier monto anterior (por si difiriera, aunque en
      // la práctica siempre coincide con la última oferta aceptada).
      return event.outcome === 'sold' && event.final_price !== null
        ? { ...amounts, [event.lote_id]: event.final_price }
        : amounts;
    default:
      return amounts;
  }
}

export type LeadingBuyerIdsByLote = Record<string, string | null>;

/** Aplica un evento de dominio sobre el mapa de compradores líderes -- mismo criterio
 * que `applyDomainEventToLeadingAmounts`, pero siguiendo `buyer_id` (real, sin
 * enmascarar -- ver `events.ts`) en vez del monto. Lo usa `TimedSalaPage` para saber si
 * quien está mirando la pantalla es quien va liderando el lote fijado, y así avisarle
 * desde `PlaceBidButton` en vez de dejar que se sobreoferte a sí mismo -- mismo patrón
 * que ya usa `SalaPage` (LIVE), pero por lote (`Record<loteId, ...>`) en vez de un único
 * `isLeadingBidder` global, porque acá conviven varios lotes `open` a la vez. Igual que
 * ese, arranca sin poder reconstruirse desde el snapshot inicial (`GET .../leading` solo
 * trae el monto, nunca `buyer_id`) -- se resuelve recién con el primer evento en vivo. */
export function applyDomainEventToLeadingBuyerIds(
  buyerIds: LeadingBuyerIdsByLote,
  event: SalaDomainEvent,
): LeadingBuyerIdsByLote {
  switch (event.event_type) {
    case 'oferta.accepted':
      return { ...buyerIds, [event.lote_id]: event.buyer_id };
    case 'oferta.winner_changed':
      return { ...buyerIds, [event.lote_id]: event.new_buyer_id };
    case 'lote.opened':
    case 'lote.requeued':
      // Lote (re)abierto -- todavía no hay ninguna oferta encima, cualquier líder
      // anterior (de una ronda previa, si fue desierto y se reencoló) ya no aplica.
      return { ...buyerIds, [event.lote_id]: null };
    default:
      return buyerIds;
  }
}

export type OfferActivityVersionByLote = Record<string, number>;

/** Contador por lote que sube en cada `oferta.accepted`/`oferta.rejected` -- no lleva
 * ningún dato de la oferta en sí (a diferencia de `applyDomainEventToLeadingAmounts`):
 * es solo la señal de "refetch" que consume `useLoteRecentOffers` (`hooks.ts`) para
 * volver a pedir el historial enmascarado del lote fijo en `TimedLoteBidRail` por
 * HTTP, en vez de reconstruir la entrada en el cliente -- el evento crudo trae
 * `buyer_id` sin enmascarar (ver `features/sala/realtime/events.ts`), y este feature no
 * tiene forma de aplicarle `SnapshotService._mask_oferta` del lado del cliente. */
export function applyDomainEventToOfferActivityVersion(
  versions: OfferActivityVersionByLote,
  event: SalaDomainEvent,
): OfferActivityVersionByLote {
  if (event.event_type !== 'oferta.accepted' && event.event_type !== 'oferta.rejected') return versions;
  return { ...versions, [event.lote_id]: (versions[event.lote_id] ?? 0) + 1 };
}
