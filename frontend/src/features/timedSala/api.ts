/**
 * Llamada HTTP propia del feature de sala Timed -- mismo patrón que `features/sala/api.ts`.
 */

import { apiClient } from '../../shared/api/client';
import type { OfertaSnapshotEntry } from '../sala/types';

/** `GET /remates/{remateId}/lotes/{loteId}/ofertas/leading` -- monto de la oferta
 * vigente de un lote puntual, `null` si todavía no tiene ninguna. Visible también para
 * un visitante anónimo (ADR-049). A diferencia de la sala LIVE (que trae esto ya
 * incluido en el snapshot de "el lote activo"), acá hace falta pedirlo lote por lote:
 * `RemateStateSnapshot` está armado alrededor de un único `active_lote`, no de una
 * lista -- ver `features/sala/types.ts`. Se llama una vez por lote abierto al entrar a
 * la grilla (`useTimedSalaState`); de ahí en más, el monto se mantiene solo vía los
 * eventos de dominio ya sincronizados (`oferta.accepted`/`lote.closed`, ver
 * `realtime.ts`), sin volver a pedir nada por HTTP.
 *
 * La función vive en `features/remates/api.ts` (también la usa el detalle de un remate
 * TIMED, `RemateDetailPage`) -- acá solo se re-exporta para no romper los imports
 * existentes de este feature. */
export { fetchLeadingOfferAmountRequest } from '../remates/api';

/** `GET /remates/{remateId}/lotes/{loteId}/ofertas/recientes` -- últimas ofertas de un
 * lote puntual, ya enmascaradas por el backend (`buyer_id` anulado salvo dueño/admin,
 * ver `backend/app/snapshot/service.py::get_lote_recent_offers`). Se usa desde el panel
 * de detalle del lote fijado en `LoteQueueList` -- distinto del historial
 * completo (`GET .../ofertas`, exclusivo del rematador dueño, ver ese endpoint) que
 * alimenta la Consola Operativa. */
export async function fetchLoteRecentOffersRequest(
  remateId: string,
  loteId: string,
): Promise<OfertaSnapshotEntry[]> {
  const { data } = await apiClient.get<OfertaSnapshotEntry[]>(
    `/remates/${remateId}/lotes/${loteId}/ofertas/recientes`,
  );
  return data;
}
