import { useMemo, useState } from 'react';
import { Alert } from '../../../shared/components/Alert';
import { Button } from '../../../shared/components/Button';
import { EmptyState } from '../../../shared/components/EmptyState';
import { DashboardToolbar } from '../components/DashboardToolbar';
import { GavelIcon } from '../components/icons';
import { RemateCard } from '../components/RemateCard';
import { RemateCardSkeleton } from '../components/RemateCardSkeleton';
import { DEFAULT_FILTERS, filterAndSortRemates } from '../filtering';
import { useRemates } from '../hooks';

const SKELETON_COUNT = 6;

/**
 * Dashboard del comprador (Épica 4, Módulo 4.3) -- punto de entrada al sistema para
 * cualquier usuario con rol `comprador`. Carga toda la lista de remates visible para el
 * usuario actual una sola vez (`useRemates`) y filtra/ordena/busca client-side sobre esa
 * lista (`filterAndSortRemates`, ver docs/25-dashboard-comprador.md sobre por qué: el
 * backend no expone búsqueda de texto). El backend ya excluye `draft` para cualquiera
 * que no sea dueño/admin (`RemateService._is_visible`), así que todo lo que llega acá es
 * seguro de mostrar tal cual.
 */
export function CompradorDashboardPage() {
  const { remates, isLoading, error, reload } = useRemates();
  const [filters, setFilters] = useState(DEFAULT_FILTERS);

  const filteredRemates = useMemo(() => filterAndSortRemates(remates, filters), [remates, filters]);

  const hasAnyRemates = remates.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Remates disponibles</h1>
        <p className="mt-1 text-sm text-slate-500">
          Explorá los remates en vivo y programados a los que podés sumarte.
        </p>
      </div>

      <DashboardToolbar filters={filters} onChange={setFilters} />

      {error && (
        <Alert variant="error">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{error.message}</span>
            <Button variant="secondary" onClick={reload}>
              Reintentar
            </Button>
          </div>
        </Alert>
      )}

      {isLoading && !error && (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: SKELETON_COUNT }, (_, index) => (
            <RemateCardSkeleton key={index} />
          ))}
        </div>
      )}

      {!isLoading && !error && hasAnyRemates && filteredRemates.length === 0 && (
        <EmptyState
          icon={<GavelIcon className="h-10 w-10" />}
          title="Ningún remate coincide con tu búsqueda"
          description="Probá con otro título, o quitá alguno de los filtros aplicados."
          action={
            <Button variant="secondary" onClick={() => setFilters(DEFAULT_FILTERS)}>
              Limpiar filtros
            </Button>
          }
        />
      )}

      {!isLoading && !error && !hasAnyRemates && (
        <EmptyState
          icon={<GavelIcon className="h-10 w-10" />}
          title="Todavía no hay remates disponibles"
          description="Cuando un rematador programe un remate, vas a poder verlo acá."
        />
      )}

      {!isLoading && !error && filteredRemates.length > 0 && (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {filteredRemates.map((remate) => (
            <RemateCard key={remate.id} remate={remate} />
          ))}
        </div>
      )}
    </div>
  );
}
