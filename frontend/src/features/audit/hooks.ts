/**
 * Hook del feature de auditoría (Épica 7, Módulo 7.2). Fetch simple por HTTP, sin
 * tiempo real: a diferencia de Analítica (Épica 7.1), el log de auditoría es un
 * registro histórico -- no tiene sentido un refetch debounced ante eventos de dominio,
 * el usuario dispara la actualización cambiando de página o de filtro (mismo criterio
 * que cualquier tabla administrativa paginada).
 */

import { useEffect, useState } from 'react';
import { normalizeApiError, type NormalizedApiError } from '../../shared/api/errors';
import type { Page } from '../../shared/api/types';
import { fetchGlobalAuditLogRequest, fetchRemateAuditLogRequest } from './api';
import type { AuditLogEntry, AuditLogFilters, AuditLogScope } from './types';

export interface UseAuditLogResult {
  data: Page<AuditLogEntry> | null;
  isLoading: boolean;
  error: NormalizedApiError | null;
}

export function useAuditLog(
  scope: AuditLogScope,
  filters: AuditLogFilters,
  page: number,
  pageSize: number,
): UseAuditLogResult {
  const [data, setData] = useState<Page<AuditLogEntry> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<NormalizedApiError | null>(null);

  const remateId = scope.type === 'remate' ? scope.remateId : null;
  const { actor_id, action, resource_type, date_from, date_to, search, sort } = filters;

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    const resolvedFilters: AuditLogFilters = {
      actor_id,
      action,
      resource_type,
      date_from,
      date_to,
      search,
      sort,
    };
    const request = remateId
      ? fetchRemateAuditLogRequest(remateId, resolvedFilters, page, pageSize)
      : fetchGlobalAuditLogRequest(resolvedFilters, page, pageSize);

    request
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
  }, [remateId, actor_id, action, resource_type, date_from, date_to, search, sort, page, pageSize]);

  return { data, isLoading, error };
}
