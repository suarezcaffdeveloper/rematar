/**
 * Hooks del feature de historial (Épica 7, Módulo 7.3). Fetch simple por HTTP, sin
 * tiempo real -- mismo criterio que `features/audit/hooks.ts`: es un registro
 * histórico, se actualiza al cambiar filtro/página, no ante eventos de dominio.
 */

import { useEffect, useState } from 'react';
import { normalizeApiError, type NormalizedApiError } from '../../shared/api/errors';
import type { Page } from '../../shared/api/types';
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

export interface UseFinishedRematesResult {
  data: Page<FinishedRemateSummary> | null;
  isLoading: boolean;
  error: NormalizedApiError | null;
}

export function useFinishedRemates(
  filters: HistoryListFilters,
  page: number,
  pageSize: number,
): UseFinishedRematesResult {
  const [data, setData] = useState<Page<FinishedRemateSummary> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<NormalizedApiError | null>(null);

  const { search, date_from, date_to, sort } = filters;

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    fetchFinishedRemateHistoryRequest({ search, date_from, date_to, sort }, page, pageSize)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err) => {
        if (!cancelled) setError(normalizeApiError(err));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [search, date_from, date_to, sort, page, pageSize]);

  return { data, isLoading, error };
}

export interface UseRemateHistoryDetailResult {
  data: RemateHistoryDetail | null;
  isLoading: boolean;
  error: NormalizedApiError | null;
  reload: () => void;
}

export function useRemateHistoryDetail(remateId: string): UseRemateHistoryDetailResult {
  const [data, setData] = useState<RemateHistoryDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<NormalizedApiError | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    if (!remateId) return;

    fetchRemateHistoryDetailRequest(remateId)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err) => {
        if (!cancelled) setError(normalizeApiError(err));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [remateId, reloadToken]);

  return { data, isLoading, error, reload: () => setReloadToken((token) => token + 1) };
}

export interface UseLoteHistoryDetailResult {
  data: LoteHistoryDetail | null;
  isLoading: boolean;
  error: NormalizedApiError | null;
}

export function useLoteHistoryDetail(
  remateId: string,
  loteId: string,
  page: number,
  pageSize: number,
): UseLoteHistoryDetailResult {
  const [data, setData] = useState<LoteHistoryDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<NormalizedApiError | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    if (!remateId || !loteId) return;

    fetchLoteHistoryDetailRequest(remateId, loteId, page, pageSize)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err) => {
        if (!cancelled) setError(normalizeApiError(err));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [remateId, loteId, page, pageSize]);

  return { data, isLoading, error };
}
