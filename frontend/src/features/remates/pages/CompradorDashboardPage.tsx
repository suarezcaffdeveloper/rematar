import { useMemo, useState } from 'react';
import { Alert } from '../../../shared/components/Alert';
import { Button } from '../../../shared/components/Button';
import { EmptyState } from '../../../shared/components/EmptyState';
import { Pagination } from '../../../shared/components/Pagination';
import { usePagedList } from '../../../shared/hooks/usePagedList';
import { useBreadcrumb } from '../../../app/layouts/useBreadcrumb';
import { useWideLayout } from '../../../app/layouts/useWideLayout';
import { DashboardToolbar } from '../components/DashboardToolbar';
import { GavelIcon } from '../components/icons';
import { RemateCard } from '../components/RemateCard';
import { RemateCardSkeleton } from '../components/RemateCardSkeleton';
import { DEFAULT_FILTERS, filterAndSortRemates, type RemateFilters } from '../filtering';
import { useRemates } from '../hooks';

const SKELETON_COUNT = 8;
const PAGE_SIZE = 12;
const CARD_GRID_CLASSES = 'grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';

/**
 * Dashboard del comprador (Épica 4, Módulo 4.3; ampliado en la Épica 9, Etapa 3 --
 * rediseño; simplificado en la Épica 9, Etapa 5 -- foco 100% en la grilla de remates
 * disponibles) -- punto de entrada al sistema para cualquier usuario con rol
 * `comprador`. Carga toda la lista de remates visible para el usuario actual una sola
 * vez (`useRemates`) y filtra/ordena/busca client-side sobre esa lista
 * (`filterAndSortRemates`, ver docs/25-dashboard-comprador.md sobre por qué: el
 * backend no expone búsqueda de texto). El backend ya excluye `draft` para cualquiera
 * que no sea dueño/admin (`RemateService._is_visible`), así que todo lo que llega acá es
 * seguro de mostrar tal cual. `useWideLayout()` le pide a `AppLayout` un `<main>` más
 * ancho (mismo mecanismo que Sala/Consola Operativa) para que la grilla de 4 columnas
 * tenga aire real en pantallas grandes.
 */
export function CompradorDashboardPage() {
  useWideLayout();
  useBreadcrumb([{ label: 'Inicio', to: '/' }, { label: 'Remates disponibles' }]);
  const { remates, isLoading, error, reload } = useRemates();
  const [filters, setFilters] = useState(DEFAULT_FILTERS);

  const filteredRemates = useMemo(() => filterAndSortRemates(remates, filters), [remates, filters]);
  const { page, totalPages, pageItems, goToPage, resetPage } = usePagedList(filteredRemates, PAGE_SIZE);
  const hasAnyRemates = remates.length > 0;

  function handleFiltersChange(next: RemateFilters) {
    setFilters(next);
    resetPage();
  }

  function handlePageChange(next: number) {
    goToPage(next);
    // Sin esto, cambiar de página deja el scroll donde estaba -- a la altura de la
    // paginación, al pie de la grilla anterior -- así que la página nueva arranca
    // invisible hasta que el usuario suba a mano.
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center gap-4 border-b border-slate-200 pb-6">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-sm">
          <GavelIcon className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Remates disponibles</h1>
          <p className="mt-1 text-sm text-slate-500">
            Explorá los remates en vivo y programados a los que podés sumarte.
          </p>
        </div>
      </div>

      <DashboardToolbar filters={filters} onChange={handleFiltersChange} />

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
        <div className={CARD_GRID_CLASSES}>
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
            <Button variant="secondary" onClick={() => handleFiltersChange(DEFAULT_FILTERS)}>
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
        <>
          <div className={CARD_GRID_CLASSES}>
            {pageItems.map((remate) => (
              <RemateCard key={remate.id} remate={remate} />
            ))}
          </div>

          <Pagination page={page} totalPages={totalPages} onPageChange={handlePageChange} />
        </>
      )}
    </div>
  );
}
