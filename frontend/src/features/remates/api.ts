/**
 * Llamadas HTTP del feature de remates -- funciones puras, sin estado, mismo patrón que
 * `features/auth/api.ts`. Todas usan `apiClient` (autenticado, con refresh automático):
 * no hay endpoint público de remates, un comprador siempre tiene sesión para llegar acá
 * (vive detrás de `RequireAuth`).
 */

import { apiClient } from '../../shared/api/client';
import type { Page } from '../../shared/api/types';
import type { Lote, LoteListParams, Remate, RemateListParams } from './types';

export async function fetchRematesRequest(params: RemateListParams): Promise<Page<Remate>> {
  const { data } = await apiClient.get<Page<Remate>>('/remates', { params });
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
