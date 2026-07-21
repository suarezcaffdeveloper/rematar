/**
 * Llamadas HTTP del feature de auditoría (Épica 7, Módulo 7.2). Ver
 * docs/36-sistema-de-auditoria-y-trazabilidad.md. Mismo patrón que `features/
 * analytics/api.ts`: un único endpoint de lectura por scope, sin escritura (todo el
 * registro lo hace el backend).
 */

import { apiClient } from '../../shared/api/client';
import type { Page } from '../../shared/api/types';
import type { AuditLogEntry, AuditLogFilters } from './types';

function toQueryParams(filters: AuditLogFilters, page: number, pageSize: number): Record<string, string> {
  const params: Record<string, string> = { page: String(page), page_size: String(pageSize) };
  if (filters.actor_id) params.actor_id = filters.actor_id;
  if (filters.action) params.action = filters.action;
  if (filters.resource_type) params.resource_type = filters.resource_type;
  if (filters.date_from) params.date_from = filters.date_from;
  if (filters.date_to) params.date_to = filters.date_to;
  if (filters.search) params.search = filters.search;
  if (filters.sort) params.sort = filters.sort;
  return params;
}

export async function fetchGlobalAuditLogRequest(
  filters: AuditLogFilters,
  page: number,
  pageSize: number,
): Promise<Page<AuditLogEntry>> {
  const { data } = await apiClient.get<Page<AuditLogEntry>>('/audit', {
    params: toQueryParams(filters, page, pageSize),
  });
  return data;
}

export async function fetchRemateAuditLogRequest(
  remateId: string,
  filters: AuditLogFilters,
  page: number,
  pageSize: number,
): Promise<Page<AuditLogEntry>> {
  const { data } = await apiClient.get<Page<AuditLogEntry>>(`/remates/${remateId}/audit`, {
    params: toQueryParams(filters, page, pageSize),
  });
  return data;
}
