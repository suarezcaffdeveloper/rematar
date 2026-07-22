/**
 * Llamadas HTTP del feature de historial (Épica 7, Módulo 7.3). Ver
 * docs/37-historial-y-resultados-de-remates.md. Mismo patrón que `features/audit/api.ts`.
 *
 * `fetchFinishedRemateHistoryRequest` es una única llamada reutilizada tanto por el
 * panel global del admin como por el listado del rematador -- a diferencia de
 * Auditoría (que tiene dos endpoints distintos, global y scoped), acá el backend
 * (`HistoryService.list_finished`) ya resuelve el scope según el rol del token, sin
 * que el cliente tenga que pedir algo distinto.
 */

import { apiClient } from '../../shared/api/client';
import type { Page } from '../../shared/api/types';
import type {
  FinishedRemateSummary,
  HistoryListFilters,
  LoteHistoryDetail,
  RemateHistoryDetail,
} from './types';

function toQueryParams(filters: HistoryListFilters, page: number, pageSize: number): Record<string, string> {
  const params: Record<string, string> = { page: String(page), page_size: String(pageSize) };
  if (filters.search) params.search = filters.search;
  if (filters.date_from) params.date_from = filters.date_from;
  if (filters.date_to) params.date_to = filters.date_to;
  if (filters.sort) params.sort = filters.sort;
  return params;
}

export async function fetchFinishedRemateHistoryRequest(
  filters: HistoryListFilters,
  page: number,
  pageSize: number,
): Promise<Page<FinishedRemateSummary>> {
  const { data } = await apiClient.get<Page<FinishedRemateSummary>>('/history/remates', {
    params: toQueryParams(filters, page, pageSize),
  });
  return data;
}

export async function fetchRemateHistoryDetailRequest(remateId: string): Promise<RemateHistoryDetail> {
  const { data } = await apiClient.get<RemateHistoryDetail>(`/history/remates/${remateId}`);
  return data;
}

export async function fetchLoteHistoryDetailRequest(
  remateId: string,
  loteId: string,
  page: number,
  pageSize: number,
): Promise<LoteHistoryDetail> {
  const { data } = await apiClient.get<LoteHistoryDetail>(
    `/history/remates/${remateId}/lotes/${loteId}`,
    { params: { page, page_size: pageSize } },
  );
  return data;
}
