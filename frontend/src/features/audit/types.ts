/**
 * Tipos que reflejan `backend/app/audit/schemas.py` (Épica 7, Módulo 7.2). Ver
 * docs/36-sistema-de-auditoria-y-trazabilidad.md.
 */

/** `AuditLogEntryRead` -- una fila del log, sin la envoltura de paginación. */
export interface AuditLogEntry {
  id: string;
  occurred_at: string;
  actor_id: string | null;
  actor_name: string | null;
  actor_role: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  remate_id: string | null;
  details: Record<string, unknown> | null;
}

/** Filtros de `GET /audit` / `GET /remates/{id}/audit` -- campos vacíos se omiten del
 * query string, ver `api.ts`. */
export interface AuditLogFilters {
  actor_id?: string;
  action?: string;
  resource_type?: string;
  date_from?: string;
  date_to?: string;
  search?: string;
  sort?: 'asc' | 'desc';
}

export type AuditLogScope = { type: 'global' } | { type: 'remate'; remateId: string };
