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

// `page_size` de `/postauction/ventas` está topeado a 100 en el backend (`router.py`,
// `Query(..., le=100)`) -- pedir más de una vez (como hacía `RemateHistoryDetailPage` con
// 200) devuelve 422 y deja `data` en `null` para siempre, sin ningún caso post-remate
// cargado. Mismo patrón de "traer todo hasta un tope" que `fetchAllLotes`/`useRemates`.
const VENTAS_PAGE_SIZE = 100;
const MAX_VENTAS_POR_REMATE = 300;

async function fetchAllVentasAdjudicadasForRemate(remateId: string): Promise<PostAuctionCase[]> {
  const collected: PostAuctionCase[] = [];
  let page = 1;
  while (collected.length < MAX_VENTAS_POR_REMATE) {
    const result = await fetchVentasAdjudicadasRequest({ remate_id: remateId }, page, VENTAS_PAGE_SIZE);
    collected.push(...result.items);
    const gotFullPage = result.items.length === VENTAS_PAGE_SIZE;
    const moreRemain = collected.length < result.total;
    if (!gotFullPage || !moreRemain) break;
    page += 1;
  }
  return collected;
}

export type UseVentasAdjudicadasForRemateResult = UseAsyncResourceResult<PostAuctionCase[]>;

/** Todos los casos post-remate de un remate puntual, sin paginar en la UI -- usado por
 * `RemateHistoryDetailPage` para cruzar cada lote vendido con su venta adjudicada (link
 * "Ir a Ventas Adjudicadas" de `LoteResultCard`). */
export function useVentasAdjudicadasForRemate(remateId: string): UseVentasAdjudicadasForRemateResult {
  return useAsyncResource(() => fetchAllVentasAdjudicadasForRemate(remateId), [remateId], []);
}

export type UseVentaDetailResult = UseAsyncResourceResult<PostAuctionCaseDetail | null>;

export function useVentaDetail(caseId: string): UseVentaDetailResult {
  return useAsyncResource(() => fetchVentaDetailRequest(caseId), [caseId], null, {
    enabled: Boolean(caseId),
  });
}

export type UseMisComprasResult = UseAsyncResourceResult<Page<PostAuctionCase> | null>;

export function useMisCompras(
  filters: PostAuctionListFilters,
  page: number,
  pageSize: number,
): UseMisComprasResult {
  const { status, search } = filters;
  return useAsyncResource(
    () => fetchMisComprasRequest({ status, search }, page, pageSize),
    [status, search, page, pageSize],
    null,
  );
}

export type UseMiCompraDetailResult = UseAsyncResourceResult<PostAuctionCaseDetail | null>;

export function useMiCompraDetail(caseId: string): UseMiCompraDetailResult {
  return useAsyncResource(() => fetchMiCompraDetailRequest(caseId), [caseId], null, {
    enabled: Boolean(caseId),
  });
}
