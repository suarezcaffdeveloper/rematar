import { useState } from 'react';
import { Alert } from '../../../shared/components/Alert';
import { Breadcrumb } from '../../../shared/components/Breadcrumb';
import { Button } from '../../../shared/components/Button';
import { EmptyState } from '../../../shared/components/EmptyState';
import { Skeleton } from '../../../shared/components/Skeleton';
import { GavelIcon } from '../../remates/components/icons';
import { CaseCard } from '../components/CaseCard';
import { SearchFilterBar } from '../components/SearchFilterBar';
import { useVentasAdjudicadas } from '../hooks';
import type { PostAuctionListFilters } from '../types';

const PAGE_SIZE = 12;

/**
 * "Ventas adjudicadas" del rematador (Épica 7, Módulo 7.5), en `/ventas-adjudicadas`.
 * Buscar y filtrar por estado son requisitos explícitos del enunciado -- ver
 * `SearchFilterBar`. El backend (`PostAuctionService.list_for_rematador`) ya restringe a
 * las ventas propias; un `comprador` que llegue por URL directa recibe 403.
 */
export function VentasAdjudicadasPage() {
  const [filters, setFilters] = useState<PostAuctionListFilters>({});
  const [page, setPage] = useState(1);

  const { data, isLoading, error } = useVentasAdjudicadas(filters, page, PAGE_SIZE);

  function handleFiltersChange(next: PostAuctionListFilters) {
    setFilters(next);
    setPage(1);
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumb items={[{ label: 'Mis remates', to: '/' }, { label: 'Ventas adjudicadas' }]} />

      <div>
        <h1 className="text-2xl font-bold text-slate-900">Ventas adjudicadas</h1>
        <p className="mt-1 text-sm text-slate-500">
          Seguimiento del proceso post-remate: contacto, pago y entrega de cada lote vendido.
        </p>
      </div>

      <SearchFilterBar value={filters} onChange={handleFiltersChange} />

      {error ? (
        <Alert variant="error">No se pudieron cargar las ventas adjudicadas.</Alert>
      ) : isLoading && !data ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-40 rounded-xl" />
          ))}
        </div>
      ) : data && data.items.length === 0 ? (
        <EmptyState
          icon={<GavelIcon className="h-10 w-10" />}
          title="Sin ventas adjudicadas"
          description="Cuando se adjudique un lote de uno de tus remates, el caso aparece acá automáticamente."
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {data?.items.map((item) => (
              <CaseCard
                key={item.id}
                item={item}
                to={`/ventas-adjudicadas/${item.id}`}
                perspective="rematador"
              />
            ))}
          </div>

          {data && data.total > PAGE_SIZE && (
            <div className="flex items-center justify-between border-t border-slate-200 pt-3">
              <span className="text-xs text-slate-500">
                {data.total} {data.total === 1 ? 'venta' : 'ventas'} · página {page} de {totalPages}
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
