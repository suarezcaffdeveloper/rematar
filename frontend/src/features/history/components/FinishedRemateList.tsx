import { useState } from 'react';
import { Alert } from '../../../shared/components/Alert';
import { Button } from '../../../shared/components/Button';
import { EmptyState } from '../../../shared/components/EmptyState';
import { Skeleton } from '../../../shared/components/Skeleton';
import { GavelIcon } from '../../remates/components/icons';
import { useFinishedRemates } from '../hooks';
import type { HistoryListFilters as HistoryListFiltersValue } from '../types';
import { FinishedRemateCard } from './FinishedRemateCard';
import { HistoryFilters } from './HistoryFilters';

const PAGE_SIZE = 12;

export interface FinishedRemateListProps {
  /** `true` en el panel global del admin -- ver `FinishedRemateCard`. */
  showOwner?: boolean;
}

/**
 * Listado de remates finalizados/cancelados (Épica 7, Módulo 7.3): filtros + tarjetas +
 * paginación -- reutilizado tal cual por `RemateHistoryListPage` (rematador, `/historial`)
 * y `AdminHistoryPanel` (admin, pestaña de `/admin`). A diferencia de `AuditLogView`
 * (Módulo 7.2, dos endpoints distintos según scope), acá hay un único endpoint
 * (`GET /history/remates`) que el backend ya resuelve según el rol del token
 * (`HistoryService.list_finished`) -- este componente no necesita saber quién lo mira.
 */
export function FinishedRemateList({ showOwner = false }: FinishedRemateListProps) {
  const [filters, setFilters] = useState<HistoryListFiltersValue>({ sort: 'date_desc' });
  const [page, setPage] = useState(1);

  const { data, isLoading, error } = useFinishedRemates(filters, page, PAGE_SIZE);

  function handleFiltersChange(next: HistoryListFiltersValue) {
    setFilters(next);
    setPage(1);
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="flex flex-col gap-4">
      <HistoryFilters value={filters} onChange={handleFiltersChange} />

      {error ? (
        <Alert variant="error">No se pudo cargar el historial de remates.</Alert>
      ) : isLoading && !data ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-64 rounded-2xl" />
          ))}
        </div>
      ) : data && data.items.length === 0 ? (
        <EmptyState
          icon={<GavelIcon className="h-10 w-10" />}
          title="Sin remates en el historial"
          description="Todavía no hay remates finalizados o cancelados que coincidan con los filtros."
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {data?.items.map((remate) => (
              <FinishedRemateCard key={remate.id} remate={remate} showOwner={showOwner} />
            ))}
          </div>

          {data && data.total > PAGE_SIZE && (
            <div className="flex items-center justify-between border-t border-line pt-3">
              <span className="text-xs text-ink-muted">
                {data.total} {data.total === 1 ? 'remate' : 'remates'} · página {page} de {totalPages}
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
