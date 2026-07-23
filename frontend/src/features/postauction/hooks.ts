/**
 * Hooks del feature Post-Remate (Épica 7, Módulo 7.5). Fetch simple por HTTP -- sin
 * WebSocket propio: la sincronización en vivo (si el usuario ya está en la sala de ese
 * remate) la resuelve el pipeline existente (`app/realtime/`), no esta pantalla; acá
 * alcanza con `reload()` manual después de una mutación (cambiar estado/agregar nota),
 * mismo criterio que `features/history/hooks.ts`.
 */

import { useEffect, useState } from 'react';
import { normalizeApiError, type NormalizedApiError } from '../../shared/api/errors';
import type { Page } from '../../shared/api/types';
import {
  fetchMiCompraDetailRequest,
  fetchMisComprasRequest,
  fetchVentaDetailRequest,
  fetchVentasAdjudicadasRequest,
} from './api';
import type { PostAuctionCase, PostAuctionCaseDetail, PostAuctionListFilters } from './types';

export interface UseVentasAdjudicadasResult {
  data: Page<PostAuctionCase> | null;
  isLoading: boolean;
  error: NormalizedApiError | null;
}

export function useVentasAdjudicadas(
  filters: PostAuctionListFilters,
  page: number,
  pageSize: number,
): UseVentasAdjudicadasResult {
  const [data, setData] = useState<Page<PostAuctionCase> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<NormalizedApiError | null>(null);

  const { status, remate_id, search } = filters;

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    fetchVentasAdjudicadasRequest({ status, remate_id, search }, page, pageSize)
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
  }, [status, remate_id, search, page, pageSize]);

  return { data, isLoading, error };
}

export interface UseVentaDetailResult {
  data: PostAuctionCaseDetail | null;
  isLoading: boolean;
  error: NormalizedApiError | null;
  reload: () => void;
}

export function useVentaDetail(caseId: string): UseVentaDetailResult {
  const [data, setData] = useState<PostAuctionCaseDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<NormalizedApiError | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!caseId) return;
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    fetchVentaDetailRequest(caseId)
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
  }, [caseId, reloadToken]);

  return { data, isLoading, error, reload: () => setReloadToken((token) => token + 1) };
}

export interface UseMisComprasResult {
  data: Page<PostAuctionCase> | null;
  isLoading: boolean;
  error: NormalizedApiError | null;
}

export function useMisCompras(page: number, pageSize: number): UseMisComprasResult {
  const [data, setData] = useState<Page<PostAuctionCase> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<NormalizedApiError | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    fetchMisComprasRequest(page, pageSize)
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
  }, [page, pageSize]);

  return { data, isLoading, error };
}

export interface UseMiCompraDetailResult {
  data: PostAuctionCaseDetail | null;
  isLoading: boolean;
  error: NormalizedApiError | null;
}

export function useMiCompraDetail(caseId: string): UseMiCompraDetailResult {
  const [data, setData] = useState<PostAuctionCaseDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<NormalizedApiError | null>(null);

  useEffect(() => {
    if (!caseId) return;
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    fetchMiCompraDetailRequest(caseId)
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
  }, [caseId]);

  return { data, isLoading, error };
}
