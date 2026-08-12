/**
 * Lógica pura del formulario de oferta (`components/PlaceBidButton.tsx`) -- en su
 * propio archivo, no en el del componente, mismo criterio que `realtime/reducer.ts`
 * (funciones puras separadas de dónde viven los `useState`/efectos).
 */

import type { Lote } from '../remates/types';
import type { OfertaSnapshotEntry } from './types';

/** Monto mínimo válido para la próxima oferta -- mismo cálculo que
 * `AuctionEngine._first_rejection_reason` (backend): precio inicial si todavía no hay
 * ninguna oferta, o la oferta vigente más el incremento mínimo. Aritmética simple con
 * `Number` (no `Decimal`): es solo una sugerencia de UI, el servidor siempre revalida
 * con precisión exacta (RNF-11). */
export function computeMinimumAmount(lote: Lote, winningOffer: OfertaSnapshotEntry | null): string {
  if (winningOffer === null) return lote.base_price;
  return (Number(winningOffer.amount) + Number(lote.min_increment)).toFixed(2);
}

/** Tres montos sugeridos para ofertar con un click (`PlaceBidButton`, reemplaza al
 * atajo único "+incremento mínimo") -- el mínimo válido y dos escalones más, cada uno
 * un incremento mínimo por encima del anterior. Elegir uno solo completa el input, no
 * manda la oferta -- eso sigue requiriendo el botón "Ofertar" (pedido explícito). Misma
 * aritmética simple con `Number` que `computeMinimumAmount`, por la misma razón: son
 * sugerencias de UI, el servidor revalida con precisión exacta (RNF-11). */
export function computeQuickBidSuggestions(lote: Lote, winningOffer: OfertaSnapshotEntry | null): string[] {
  const minimum = Number(computeMinimumAmount(lote, winningOffer));
  const increment = Number(lote.min_increment);
  return [0, 1, 2].map((steps) => (minimum + increment * steps).toFixed(2));
}
