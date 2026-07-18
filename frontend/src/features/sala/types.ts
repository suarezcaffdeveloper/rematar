/**
 * Tipos que reflejan `backend/app/snapshot/schemas.py` -- el mismo límite de módulo que
 * el backend ya traza: `app/snapshot/` vive fuera de `app/modules/remates/` y
 * `app/modules/ofertas/`, y compone sus DTOs a partir de los de ambos (`RemateRead`,
 * `LoteRead`) más uno propio (`OfertaSnapshotEntry`). Acá pasa lo mismo:
 * `features/sala/` importa `Remate`/`Lote` de `features/remates/types.ts` en vez de
 * duplicarlos, y define `OfertaSnapshotEntry`/`RemateStateSnapshot` -- que no
 * pertenecen al dominio de "remates" ni al de "auth", son el snapshot en sí.
 */

import type { Lote, Remate } from '../remates/types';

/** `OfertaStatus` -- `backend/app/modules/ofertas/models.py`. `LEADING` no existe acá a
 * propósito: es un valor derivado en el backend, nunca persistido ni devuelto. */
export type OfertaStatus = 'accepted' | 'rejected' | 'outbid' | 'winning';

/**
 * `OfertaSnapshotEntry` -- `backend/app/snapshot/schemas.py`. `buyer_id` llega `null`
 * para cualquier comprador que no sea el dueño del remate ni admin (enmascarado por
 * `SnapshotService._mask_oferta`) -- en la práctica, SIEMPRE `null` para el rol
 * `comprador`, incluso para el propio postor de esa oferta. No es un hueco a resolver:
 * es la misma política de anonimato entre postores que ya aplica `LeadingOfferRead`
 * (ver docs/26-detalle-remate.md, que documentó el mismo criterio para el rematador).
 * `amount` es `string` -- mismo motivo que `Lote.base_price` (ver
 * `features/remates/types.ts`).
 */
export interface OfertaSnapshotEntry {
  id: string;
  buyer_id: string | null;
  amount: string;
  status: OfertaStatus;
  created_at: string;
}

/**
 * `RemateStateSnapshot` -- `backend/app/snapshot/schemas.py`. Es la forma que hoy llena
 * `useRemateSnapshot` con una única llamada HTTP (`GET /remates/{id}/snapshot`) y que,
 * en un módulo futuro, un cliente WebSocket va a mantener actualizada con el mismo
 * `schema_version` -- ver docs/27-sala-del-remate.md, "Preparación para WebSockets".
 */
export interface RemateStateSnapshot {
  schema_version: number;
  remate: Remate;
  active_lote: Lote | null;
  winning_offer: OfertaSnapshotEntry | null;
  recent_offers: OfertaSnapshotEntry[];
  connected_users: number;
  generated_at: string;
}
