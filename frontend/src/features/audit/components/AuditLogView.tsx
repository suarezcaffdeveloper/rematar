import { useState } from 'react';
import { Alert } from '../../../shared/components/Alert';
import { Button } from '../../../shared/components/Button';
import { Skeleton } from '../../../shared/components/Skeleton';
import { useAuditLog } from '../hooks';
import type { AuditLogFilters as AuditLogFiltersValue, AuditLogScope } from '../types';
import { AuditLogFilters } from './AuditLogFilters';
import { AuditLogTimeline } from './AuditLogTimeline';

const PAGE_SIZE = 25;

export interface AuditLogViewProps {
  scope: AuditLogScope;
}

/**
 * Vista completa del panel de auditoría (Épica 7, Módulo 7.2): filtros + línea de
 * tiempo + paginación -- reutilizada tal cual por el panel global del administrador
 * (`AdminAuditLogPage`, `/admin`) y el panel scoped a un remate del rematador
 * (`RemateAuditLogPage`, `/remates/:id/auditoria`); la única diferencia entre ambos es
 * el `scope` que reciben (ver `hooks.ts`/`api.ts`), el control de acceso real lo decide
 * el backend (`AuditService.list_global`/`list_for_remate`, admin-only o dueño-o-admin).
 */
export function AuditLogView({ scope }: AuditLogViewProps) {
  const [filters, setFilters] = useState<AuditLogFiltersValue>({ sort: 'desc' });
  const [page, setPage] = useState(1);

  const { data, isLoading, error } = useAuditLog(scope, filters, page, PAGE_SIZE);

  function handleFiltersChange(next: AuditLogFiltersValue) {
    setFilters(next);
    setPage(1);
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="flex flex-col gap-4">
      <AuditLogFilters value={filters} onChange={handleFiltersChange} />

      {error ? (
        <Alert variant="error">No se pudo cargar el registro de auditoría.</Alert>
      ) : isLoading && !data ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-16 rounded-lg" />
          ))}
        </div>
      ) : (
        <>
          <AuditLogTimeline entries={data?.items ?? []} />

          {data && data.total > PAGE_SIZE && (
            <div className="flex items-center justify-between border-t border-slate-200 pt-3">
              <span className="text-xs text-slate-500">
                {data.total} {data.total === 1 ? 'registro' : 'registros'} · página {page} de {totalPages}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  disabled={page <= 1}
                  onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                >
                  Anterior
                </Button>
                <Button
                  variant="secondary"
                  disabled={page >= totalPages}
                  onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                >
                  Siguiente
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
