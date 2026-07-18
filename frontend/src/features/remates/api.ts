/**
 * Llamadas HTTP del feature de remates -- funciones puras, sin estado, mismo patrón que
 * `features/auth/api.ts`. Todas usan `apiClient` (autenticado, con refresh automático):
 * no hay endpoint público de remates, un comprador siempre tiene sesión para llegar acá
 * (vive detrás de `RequireAuth`).
 */

import { apiClient } from '../../shared/api/client';
import type { Page } from '../../shared/api/types';
import type {
  Lote,
  LoteClosePayload,
  LoteFormPayload,
  LoteListParams,
  Remate,
  RemateFormPayload,
  RemateListParams,
} from './types';

export async function fetchRematesRequest(params: RemateListParams): Promise<Page<Remate>> {
  const { data } = await apiClient.get<Page<Remate>>('/remates', { params });
  return data;
}

/**
 * CRUD de `Remate` (Épica 2, Módulo 2.1, `backend/app/modules/remates/router.py`) --
 * consumido por la Gestión de Remates y Lotes (Épica 5, Módulo 5.3). `update` solo
 * funciona con el remate en `draft`/`scheduled` (`RemateService.update`, 422 en
 * cualquier otro estado); `deleteRemateRequest` solo con `draft` exacto (422 si no,
 * sugiriendo `cancelar` en su lugar) -- ambas reglas ya las valida el backend, el
 * frontend las refleja deshabilitando la acción correspondiente antes de intentarla.
 */
export async function createRemateRequest(payload: RemateFormPayload): Promise<Remate> {
  const { data } = await apiClient.post<Remate>('/remates', payload);
  return data;
}

export async function updateRemateRequest(remateId: string, payload: RemateFormPayload): Promise<Remate> {
  const { data } = await apiClient.patch<Remate>(`/remates/${remateId}`, payload);
  return data;
}

export async function deleteRemateRequest(remateId: string): Promise<void> {
  await apiClient.delete(`/remates/${remateId}`);
}

/** `DRAFT -> SCHEDULED` -- exige `starts_at` ya definido y futuro (`RemateService.
 * schedule`). En la interfaz se presenta como "Publicar remate" (ver docs/31-gestion-
 * remates-lotes.md): es la misma transición, "programar" y "publicar" no son dos
 * acciones del backend, una sola que hace público al remate en la fecha indicada. */
export async function scheduleRemateRequest(remateId: string): Promise<Remate> {
  const { data } = await apiClient.post<Remate>(`/remates/${remateId}/schedule`);
  return data;
}

export async function cancelRemateRequest(remateId: string, reason: string): Promise<Remate> {
  const { data } = await apiClient.post<Remate>(`/remates/${remateId}/cancel`, { reason });
  return data;
}

/** `GET /remates/{id}` -- 404 (vía `normalizeApiError`) si no existe o no es visible
 * para el usuario actual (`RemateService.get_visible_or_raise`). */
export async function fetchRemateByIdRequest(remateId: string): Promise<Remate> {
  const { data } = await apiClient.get<Remate>(`/remates/${remateId}`);
  return data;
}

export async function fetchLotesRequest(
  remateId: string,
  params: LoteListParams,
): Promise<Page<Lote>> {
  const { data } = await apiClient.get<Page<Lote>>(`/remates/${remateId}/lotes`, { params });
  return data;
}

/**
 * `RemateRead` no trae cantidad de lotes (no existe ese campo en el backend, ver
 * docs/25-dashboard-comprador.md, "Limitaciones conocidas") -- la única forma de
 * conocerla es pedir la primera página de lotes de ESE remate y quedarse con `total`
 * del envelope de paginación. `page_size: 1` para no traer datos que se van a
 * descartar; es una request aparte por remate (N+1), asumido y documentado, no una
 * optimización pendiente de esta fase.
 */
export async function fetchLoteCountRequest(remateId: string): Promise<number> {
  const { data } = await apiClient.get<Page<unknown>>(`/remates/${remateId}/lotes`, {
    params: { page: 1, page_size: 1 },
  });
  return data.total;
}

/**
 * Transiciones del motor de estados de `Remate` (Épica 2, Módulo 2.3,
 * `backend/app/modules/remates/router.py`) -- ninguna lleva body, las cuatro devuelven
 * el `Remate` ya actualizado. `start`/`resume`/`finish` se agregaron en el Dashboard del
 * Rematador (Épica 5, Módulo 5.1); `pause` se agrega acá, en la Consola Operativa (Épica
 * 5, Módulo 5.2) -- es una acción de control en vivo, no de repaso (ver
 * docs/adr/ADR-032-dashboard-rematador.md, sección D). `schedule`/`cancel` de `Remate`
 * siguen sin consumidor en el frontend (ver docs/30-consola-operativa-rematador.md,
 * "Trabajo futuro").
 */
export async function startRemateRequest(remateId: string): Promise<Remate> {
  const { data } = await apiClient.post<Remate>(`/remates/${remateId}/start`);
  return data;
}

export async function pauseRemateRequest(remateId: string): Promise<Remate> {
  const { data } = await apiClient.post<Remate>(`/remates/${remateId}/pause`);
  return data;
}

export async function resumeRemateRequest(remateId: string): Promise<Remate> {
  const { data } = await apiClient.post<Remate>(`/remates/${remateId}/resume`);
  return data;
}

export async function finishRemateRequest(remateId: string): Promise<Remate> {
  const { data } = await apiClient.post<Remate>(`/remates/${remateId}/finish`);
  return data;
}

/**
 * Transiciones del motor de estados de `Lote` (Épica 2, Módulo 2.3,
 * `backend/app/modules/remates/lotes/router.py`) -- consumidas por la Consola Operativa
 * del Rematador (Épica 5, Módulo 5.2). `open`/`close` operan sobre un lote puntual;
 * `openNext` (RF-13, "pasar al siguiente lote") elige el `PENDING` de menor
 * `display_order` sin que el cliente tenga que indicar cuál.
 */
export async function openLoteRequest(remateId: string, loteId: string): Promise<Lote> {
  const { data } = await apiClient.post<Lote>(`/remates/${remateId}/lotes/${loteId}/open`);
  return data;
}

export async function openNextLoteRequest(remateId: string): Promise<Lote> {
  const { data } = await apiClient.post<Lote>(`/remates/${remateId}/lotes/next`);
  return data;
}

export async function closeLoteRequest(
  remateId: string,
  loteId: string,
  payload: LoteClosePayload,
): Promise<Lote> {
  const { data } = await apiClient.post<Lote>(`/remates/${remateId}/lotes/${loteId}/close`, payload);
  return data;
}

/**
 * CRUD y reordenamiento de `Lote` (Épica 2, Módulo 2.2, `backend/app/modules/remates/
 * lotes/router.py`) -- consumido por la Gestión de Remates y Lotes (Épica 5, Módulo
 * 5.3). Las cuatro requieren que el remate padre esté `draft`/`scheduled`
 * (`LoteService._assert_structure_editable`, 422 en cualquier otro estado) -- una vez
 * `live`, la estructura de lotes queda congelada (RF-05/RF-07).
 */
export async function createLoteRequest(remateId: string, payload: LoteFormPayload): Promise<Lote> {
  const { data } = await apiClient.post<Lote>(`/remates/${remateId}/lotes`, payload);
  return data;
}

export async function updateLoteRequest(
  remateId: string,
  loteId: string,
  payload: LoteFormPayload,
): Promise<Lote> {
  const { data } = await apiClient.patch<Lote>(`/remates/${remateId}/lotes/${loteId}`, payload);
  return data;
}

export async function deleteLoteRequest(remateId: string, loteId: string): Promise<void> {
  await apiClient.delete(`/remates/${remateId}/lotes/${loteId}`);
}

/** `POST /remates/{id}/lotes/reorder` -- exige la lista COMPLETA y ordenada de ids de
 * lotes vigentes del remate (ni de más ni de menos, `LoteService.reorder`); devuelve
 * todos los lotes ya con su `display_order` actualizado. */
export async function reorderLotesRequest(remateId: string, loteIds: string[]): Promise<Lote[]> {
  const { data } = await apiClient.post<Lote[]>(`/remates/${remateId}/lotes/reorder`, {
    lote_ids: loteIds,
  });
  return data;
}
