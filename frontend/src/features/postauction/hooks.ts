/**
 * Hooks del feature Post-Remate (Épica 7, Módulo 7.5). Fetch simple por HTTP -- sin
 * WebSocket propio: la sincronización en vivo (si el usuario ya está en la sala de ese
 * remate) la resuelve el pipeline existente (`app/realtime/`), no esta pantalla; acá
 * alcanza con `reload()` manual después de una mutación (cambiar estado/agregar nota),
 * mismo criterio que `features/history/hooks.ts`.
 *
 * El boilerplate de fetch/cancelación/reload vive en `useAsyncResource` (Épica 8, Módulo
 * 8.0, revisión técnica) -- antes se repetía a mano en cada hook de este archivo.
 */

import type { Page } from '../../shared/api/types';
import { useAsyncResource, type UseAsyncResourceResult } from '../../shared/hooks/useAsyncResource';
import {
  fetchMiCompraDetailRequest,
  fetchMisComprasRequest,
  fetchVentaDetailRequest,
  fetchVentasAdjudicadasRequest,
} from './api';
import type { PostAuctionCase, PostAuctionCaseDetail, PostAuctionListFilters } from './types';

export type UseVentasAdjudicadasResult = UseAsyncResourceResult<Page<PostAuctionCase> | null>;

export function useVentasAdjudicadas(
  filters: PostAuctionListFilters,
  page: number,
  pageSize: number,
): UseVentasAdjudicadasResult {
  const { status, remate_id, search } = filters;
  return useAsyncResource(
    () => fetchVentasAdjudicadasRequest({ status, remate_id, search }, page, pageSize),
    [status, remate_id, search, page, pageSize],
    null,
  );
}

export type UseVentaDetailResult = UseAsyncResourceResult<PostAuctionCaseDetail | null>;

export function useVentaDetail(caseId: string): UseVentaDetailResult {
  return useAsyncResource(() => fetchVentaDetailRequest(caseId), [caseId], null, {
    enabled: Boolean(caseId),
  });
}

export type UseMisComprasResult = UseAsyncResourceResult<Page<PostAuctionCase> | null>;

export function useMisCompras(page: number, pageSize: number): UseMisComprasResult {
  return useAsyncResource(() => fetchMisComprasRequest(page, pageSize), [page, pageSize], null);
}

export type UseMiCompraDetailResult = UseAsyncResourceResult<PostAuctionCaseDetail | null>;

export function useMiCompraDetail(caseId: string): UseMiCompraDetailResult {
  return useAsyncResource(() => fetchMiCompraDetailRequest(caseId), [caseId], null, {
    enabled: Boolean(caseId),
  });
}
