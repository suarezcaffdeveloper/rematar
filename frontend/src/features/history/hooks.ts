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
import type { Lote } from '../remates/types';
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

/** `loteId -> LoteHistoryDetail`, `null` si esa llamada puntual falló (no tira abajo el
 * resto -- `Promise.allSettled`, no `Promise.all`). Solo se pide el detalle a los lotes
 * que efectivamente pudieron tener ofertas (`pending`/`cancelled` quedan afuera, nunca
 * las tuvieron). Usado por el "informe ejecutivo" del historial (`RemateHistoryDetailPage`)
 * para completar `offer_count`/`winner` por lote, dato que no viene en `Lote` ni en
 * `RemateHistoryDetail` (Épica 7, Módulo 7.3 -- ver ADR-040). */
export type LoteResultsMap = Map<string, LoteHistoryDetail | null>;
export type UseLoteResultsForRemateResult = UseAsyncResourceResult<LoteResultsMap>;

export function useLoteResultsForRemate(remateId: string, lotes: Lote[]): UseLoteResultsForRemateResult {
  const relevantLotes = lotes.filter((lote) => lote.status !== 'pending' && lote.status !== 'cancelled');
  const relevantIds = relevantLotes.map((lote) => lote.id).join(',');

  return useAsyncResource(
    async () => {
      const settled = await Promise.allSettled(
        relevantLotes.map((lote) => fetchLoteHistoryDetailRequest(remateId, lote.id, 1, 1)),
      );
      const map: LoteResultsMap = new Map();
      relevantLotes.forEach((lote, index) => {
        const result = settled[index];
        map.set(lote.id, result.status === 'fulfilled' ? result.value : null);
      });
      return map;
    },
    [remateId, relevantIds],
    new Map(),
    { enabled: Boolean(remateId) && relevantLotes.length > 0 },
  );
}
