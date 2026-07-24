/**
 * Hook del feature de auditoría (Épica 7, Módulo 7.2). Fetch simple por HTTP, sin
 * tiempo real: a diferencia de Analítica (Épica 7.1), el log de auditoría es un
 * registro histórico -- no tiene sentido un refetch debounced ante eventos de dominio,
 * el usuario dispara la actualización cambiando de página o de filtro (mismo criterio
 * que cualquier tabla administrativa paginada).
 *
 * El boilerplate de fetch/cancelación/reload vive en `useAsyncResource` (Épica 8, Módulo
 * 8.0, revisión técnica) -- antes se repetía a mano acá también.
 */

import type { Page } from '../../shared/api/types';
import { useAsyncResource, type UseAsyncResourceResult } from '../../shared/hooks/useAsyncResource';
import { fetchGlobalAuditLogRequest, fetchRemateAuditLogRequest } from './api';
import type { AuditLogEntry, AuditLogFilters, AuditLogScope } from './types';

export type UseAuditLogResult = UseAsyncResourceResult<Page<AuditLogEntry> | null>;

export function useAuditLog(
  scope: AuditLogScope,
  filters: AuditLogFilters,
  page: number,
  pageSize: number,
): UseAuditLogResult {
  const remateId = scope.type === 'remate' ? scope.remateId : null;
  const { actor_id, action, resource_type, date_from, date_to, search, sort } = filters;

  return useAsyncResource(
    () => {
      const resolvedFilters: AuditLogFilters = {
        actor_id,
        action,
        resource_type,
        date_from,
        date_to,
        search,
        sort,
      };
      return remateId
        ? fetchRemateAuditLogRequest(remateId, resolvedFilters, page, pageSize)
        : fetchGlobalAuditLogRequest(resolvedFilters, page, pageSize);
    },
    [remateId, actor_id, action, resource_type, date_from, date_to, search, sort, page, pageSize],
    null,
  );
}
