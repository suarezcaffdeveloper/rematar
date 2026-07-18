/**
 * Llamada HTTP del feature de sala -- mismo patrón que `features/remates/api.ts`.
 */

import { apiClient } from '../../shared/api/client';
import type { RemateStateSnapshot } from './types';

/** `GET /remates/{id}/snapshot` -- 404 (vía `normalizeApiError`) si el remate no existe
 * o no es visible para el usuario actual (mismo criterio que `GET /remates/{id}`, ver
 * `SnapshotService.build`). Reconstruye TODO el estado en una sola llamada: remate,
 * lote activo, oferta líder, historial reciente y conectados -- no hace falta combinar
 * varios endpoints para pintar la sala. */
export async function fetchRemateSnapshotRequest(remateId: string): Promise<RemateStateSnapshot> {
  const { data } = await apiClient.get<RemateStateSnapshot>(`/remates/${remateId}/snapshot`);
  return data;
}
