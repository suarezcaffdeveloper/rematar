/**
 * Llamada HTTP del feature de sala -- mismo patrón que `features/remates/api.ts`.
 */

import { apiClient } from '../../shared/api/client';
import type { OfertaCreateResult, RemateStateSnapshot } from './types';

/** `GET /remates/{id}/snapshot` -- 404 (vía `normalizeApiError`) si el remate no existe
 * o no es visible para el usuario actual (mismo criterio que `GET /remates/{id}`, ver
 * `SnapshotService.build`). Reconstruye TODO el estado en una sola llamada: remate,
 * lote activo, oferta líder, historial reciente y conectados -- no hace falta combinar
 * varios endpoints para pintar la sala. */
export async function fetchRemateSnapshotRequest(remateId: string): Promise<RemateStateSnapshot> {
  const { data } = await apiClient.get<RemateStateSnapshot>(`/remates/${remateId}/snapshot`);
  return data;
}

/** `POST /remates/{remateId}/lotes/{loteId}/ofertas` -- responde siempre `201`, el
 * resultado (aceptada/rechazada) viene en el cuerpo (`status`/`rejection_reason`), no
 * en el código HTTP (ver `backend/app/modules/ofertas/router.py`). El precio/historial
 * visibles para todos los conectados se actualizan solos vía el evento de dominio que
 * el backend ya reenvía por WebSocket (`realtime/reducer.ts`) -- esta llamada solo le
 * da feedback inmediato a quien ofertó. `clientToken` habilita el reintento idempotente
 * ya soportado por el backend (`OfertaCreate.client_token`, ADR-020 sección D). */
export async function placeBidRequest(
  remateId: string,
  loteId: string,
  amount: string,
  clientToken: string,
): Promise<OfertaCreateResult> {
  const { data } = await apiClient.post<OfertaCreateResult>(
    `/remates/${remateId}/lotes/${loteId}/ofertas`,
    { amount, client_token: clientToken },
  );
  return data;
}
