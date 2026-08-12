import { useLayoutEffect, useMemo, useRef, useState } from 'react';
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
 * Márgenes horizontales para que el banner del header llegue de borde a borde del área
 * de contenido real -- desde el nav lateral colapsado hasta el borde derecho de la
 * pantalla -- en vez de quedar encerrado en la columna centrada (`max-w`) que usa
 * `<main>` (ver `AppLayout`). Se mide contra el padre de `<main>` (el div con
 * `lg:pl-16` que reserva el espacio del sidebar) porque ese padre nunca está capado por
 * `max-w`, a diferencia de `<main>`, que sí lo está a partir de cierto ancho de
 * pantalla -- por eso un simple `-mx-4` no alcanza en monitores anchos.
 */
function useEdgeToEdgeMargins() {
  const ref = useRef<HTMLDivElement>(null);
  const appliedRef = useRef({ left: 0, right: 0 });
  const [margins, setMargins] = useState({ left: 0, right: 0 });

  useLayoutEffect(() => {
    function update() {
      const el = ref.current;
      const region = el?.closest('main')?.parentElement;
      if (!el || !region) return;

      const elRect = el.getBoundingClientRect();
      const regionRect = region.getBoundingClientRect();
      const left = appliedRef.current.left + (regionRect.left - elRect.left);
      const right = appliedRef.current.right + (elRect.right - regionRect.right);

      appliedRef.current = { left, right };
      setMargins({ left, right });
    }

    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return { ref, marginLeft: margins.left, marginRight: margins.right };
}

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
  const { ref: heroRef, marginLeft, marginRight } = useEdgeToEdgeMargins();

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
      <div
        ref={heroRef}
        style={{ marginLeft, marginRight }}
        className="relative -mt-8 overflow-hidden bg-slate-900"
      >
        <div
          className="absolute inset-0 bg-cover bg-[55%_45%]"
          style={{ backgroundImage: 'url(/dashboard/remates-header.png)' }}
          aria-hidden="true"
        />
        <div
          className="absolute inset-0 bg-gradient-to-b from-slate-900/60 via-slate-900/40 to-slate-900/15"
          aria-hidden="true"
        />

        <div className="relative flex flex-col gap-6 px-4 pb-32 pt-14 sm:px-8 sm:pb-44 sm:pt-20 lg:pl-[280px]">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-sm">
              <GavelIcon className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                Remates disponibles
              </h1>
              <p className="mt-1 max-w-xl text-sm font-light text-slate-200 sm:text-base">
                Explorá los remates en vivo y programados a los que podés sumarte.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="relative z-10 -mt-16 sm:-mt-20">
        <DashboardToolbar filters={filters} onChange={handleFiltersChange} />
      </div>

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
