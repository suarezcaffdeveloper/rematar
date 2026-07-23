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
