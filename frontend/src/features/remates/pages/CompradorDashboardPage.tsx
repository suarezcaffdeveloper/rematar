import { useMemo, useState } from 'react';
import { Alert } from '../../../shared/components/Alert';
import { Badge } from '../../../shared/components/Badge';
import { Button } from '../../../shared/components/Button';
import { EmptyState } from '../../../shared/components/EmptyState';
import { Pagination } from '../../../shared/components/Pagination';
import { usePagedList } from '../../../shared/hooks/usePagedList';
import { useBreadcrumb } from '../../../app/layouts/useBreadcrumb';
import { useWideLayout } from '../../../app/layouts/useWideLayout';
import { DashboardToolbar } from '../components/DashboardToolbar';
import { GavelIcon } from '../components/icons';
import { LiveRemateCarousel } from '../components/LiveRemateCarousel';
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
 * disponibles; retexturizado en la Épica 9, Etapa 8 -- mismo sistema visual que la Sala
 * del Remate, ver prototipo aprobado) -- punto de entrada al sistema para cualquier
 * usuario con rol `comprador`. Carga toda la lista de remates visible para el usuario
 * actual una sola vez (`useRemates`) y filtra/ordena/busca client-side sobre esa lista
 * (`filterAndSortRemates`, ver docs/25-dashboard-comprador.md sobre por qué: el
 * backend no expone búsqueda de texto). El backend ya excluye `draft` para cualquiera
 * que no sea dueño/admin (`RemateService._is_visible`), así que todo lo que llega acá es
 * seguro de mostrar tal cual. `useWideLayout()` le pide a `AppLayout` un `<main>` más
 * ancho (mismo mecanismo que Sala/Consola Operativa) para que la grilla de 4 columnas
 * tenga aire real en pantallas grandes.
 *
 * Composición (rediseño visual -- misma identidad que la Sala del Remate, sin copiar su
 * layout): cabecera suelta con separador `border-line`, igual espíritu que `SalaHeader`
 * pero con datos propios de un dashboard (título + cuánto hay en vivo ahora mismo, ambos
 * derivados de la misma `remates` ya cargada, sin pedidos nuevos). El banner con foto de
 * fondo que existía antes se saca -- no aportaba jerarquía real y es exactamente el tipo
 * de "hero genérico" que el rediseño pidió evitar. Debajo, una franja "En vivo ahora"
 * (`LiveRemateCarousel`, carrusel centrado con asomo de vecinos -- pedido explícito con
 * referencia visual, ver el propio componente) para que lo más urgente no dependa de
 * scrollear hasta encontrarlo entre los filtros -- no agrega ninguna fuente de datos ni
 * acción nueva, los remates en vivo siguen apareciendo también en la grilla filtrable de
 * abajo.
 */
export function CompradorDashboardPage() {
  useWideLayout();
  useBreadcrumb([{ label: 'Inicio', to: '/' }, { label: 'Remates disponibles' }]);
  const { remates, isLoading, error, reload } = useRemates();
  const [filters, setFilters] = useState(DEFAULT_FILTERS);

  const liveRemates = useMemo(() => remates.filter((remate) => remate.status === 'live'), [remates]);
  const filteredRemates = useMemo(() => filterAndSortRemates(remates, filters), [remates, filters]);
  const { page, totalPages, pageItems, goToPage, resetPage } = usePagedList(filteredRemates, PAGE_SIZE);
  const hasAnyRemates = remates.length > 0;
  const showResultsLabel = !isLoading && !error && liveRemates.length > 0 && filteredRemates.length > 0;

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
    <div className="flex flex-col gap-8 font-display">
      <div className="flex flex-col gap-3 border-b border-line pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">Remates disponibles</h1>
          <p className="mt-1 max-w-xl text-sm text-ink-muted">
            Explorá los remates en vivo y programados a los que podés sumarte.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-ink-muted">
          {liveRemates.length > 0 && (
            <span className="relative inline-flex">
              <span
                aria-hidden="true"
                className="absolute -right-0.5 -top-0.5 h-2 w-2 animate-ping rounded-full bg-success-500"
              />
              <Badge variant="success">{liveRemates.length} en vivo</Badge>
            </span>
          )}
          {hasAnyRemates && (
            <span>
              {remates.length} {remates.length === 1 ? 'remate disponible' : 'remates disponibles'}
            </span>
          )}
        </div>
      </div>

      {liveRemates.length > 0 && !isLoading && !error && (
        <div className="flex flex-col gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-faint">En vivo ahora</h2>
          <LiveRemateCarousel remates={liveRemates} />
        </div>
      )}

      <div className="flex flex-col gap-4">
        {showResultsLabel && (
          <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Todos los remates</h2>
        )}

        <DashboardToolbar filters={filters} onChange={handleFiltersChange} variant="open" />

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
            description="Cuando un martillero programe un remate, vas a poder verlo acá."
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
    </div>
  );
}
