/**
 * Hooks del feature de historial (Épica 7, Módulo 7.3). Fetch simple por HTTP, sin
 * tiempo real -- mismo criterio que `features/audit/hooks.ts`: es un registro
 * histórico, se actualiza al cambiar filtro/página, no ante eventos de dominio.
 *
 * El boilerplate de fetch/cancelación/reload vive en `useAsyncResource` (Épica 8, Módulo
 * 8.0, revisión técnica) -- antes se repetía a mano en cada hook de este archivo.
 */

import type { Page } from '../../shared/api/types';
import { useAsyncResource, type UseAsyncResourceResult } from '../../shared/hooks/useAsyncResource';
import {
  fetchFinishedRemateHistoryRequest,
  fetchLoteHistoryDetailRequest,
  fetchRemateHistoryDetailRequest,
} from './api';
import type {
  FinishedRemateSummary,
  HistoryListFilters,
  LoteHistoryDetail,
  RemateHistoryDetail,
} from './types';

export type UseFinishedRematesResult = UseAsyncResourceResult<Page<FinishedRemateSummary> | null>;

export function useFinishedRemates(
  filters: HistoryListFilters,
  page: number,
  pageSize: number,
): UseFinishedRematesResult {
  const { search, date_from, date_to, sort } = filters;
  return useAsyncResource(
    () => fetchFinishedRemateHistoryRequest({ search, date_from, date_to, sort }, page, pageSize),
    [search, date_from, date_to, sort, page, pageSize],
    null,
  );
}

export type UseRemateHistoryDetailResult = UseAsyncResourceResult<RemateHistoryDetail | null>;

export function useRemateHistoryDetail(remateId: string): UseRemateHistoryDetailResult {
  return useAsyncResource(() => fetchRemateHistoryDetailRequest(remateId), [remateId], null, {
    enabled: Boolean(remateId),
  });
}

export type UseLoteHistoryDetailResult = UseAsyncResourceResult<LoteHistoryDetail | null>;

export function useLoteHistoryDetail(
  remateId: string,
  loteId: string,
  page: number,
  pageSize: number,
): UseLoteHistoryDetailResult {
  return useAsyncResource(
    () => fetchLoteHistoryDetailRequest(remateId, loteId, page, pageSize),
    [remateId, loteId, page, pageSize],
    null,
    { enabled: Boolean(remateId && loteId) },
  );
}
