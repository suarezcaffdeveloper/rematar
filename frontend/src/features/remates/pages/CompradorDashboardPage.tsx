import { useMemo, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { useBreadcrumb } from '../../../app/layouts/useBreadcrumb';
import { useTopNavLayout } from '../../../app/layouts/useTopNavLayout';
import { Skeleton } from '../../../shared/components/Skeleton';
import { LiveGallery, MAX_GALLERY_PANELS } from '../components/home/LiveGallery';
import { RemateIndex } from '../components/home/RemateIndex';
import { RubroMosaic } from '../components/home/RubroMosaic';
import { DEFAULT_FILTERS, type RemateFilters } from '../filtering';
import { useRemates } from '../hooks';
import type { RemateCategory } from '../types';

/**
 * Inicio del comprador (Épica 4, Módulo 4.3; rediseño visual de la Épica 9, Etapa 8;
 * rediseño "galería + mosaico + índice" después). Punto de entrada al sistema para el rol
 * `comprador` y, vía `/remates`, también para visitantes anónimos y el resto de los roles
 * (agnóstica de rol/auth). Carga toda la lista de remates visible para el usuario actual
 * una sola vez (`useRemates`) y filtra/ordena/busca client-side sobre esa lista
 * (`filterAndSortRemates`, ver docs/25-dashboard-comprador.md sobre por qué: el backend no
 * expone búsqueda de texto). El backend ya excluye `draft` para cualquiera que no sea
 * dueño/admin (`RemateService._is_visible`), así que todo lo que llega acá es seguro de
 * mostrar tal cual.
 *
 * Tres bloques, todos derivados de esa misma lista ya cargada:
 * 1. `LiveGallery` -- los remates en vivo como un acordeón de paneles (solo si hay).
 * 2. `RubroMosaic` -- fichas por rubro que filtran el índice de abajo.
 * 3. `RemateIndex` -- todos los remates, con búsqueda, filtros y filtro por día.
 *
 * `useTopNavLayout()` le pide a `AppLayout` que reemplace `Sidebar` + `Header` por la
 * barra superior `BuyerTopNav` y que deje el `<main>` sin ancho ni padding: esta página
 * arma su propio contenedor, a todo el ancho de la pantalla.
 */
export function CompradorDashboardPage() {
  useTopNavLayout();
  useBreadcrumb([{ label: 'Inicio', to: '/' }, { label: 'Remates disponibles' }]);
  const reduceMotion = useReducedMotion();
  const { remates, isLoading, error, reload } = useRemates();
  const [filters, setFilters] = useState<RemateFilters>(DEFAULT_FILTERS);
  const indexRef = useRef<HTMLElement>(null);

  const liveRemates = useMemo(() => remates.filter((remate) => remate.status === 'live'), [remates]);
  const showLive = !isLoading && !error && liveRemates.length > 0;
  const showMosaic = !isLoading && !error && remates.length > 0;

  function handleSelectCategory(category: RemateCategory | 'all') {
    setFilters((current) => ({ ...current, category }));
    indexRef.current?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  }

  return (
    <div className="min-h-screen bg-white font-display text-ink">
      <div className="mx-auto w-full max-w-[110rem] px-3 py-8 sm:px-6 lg:px-10">
        <header className="mb-8 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          {showLive ? (
            <h1 className="max-w-3xl text-balance text-4xl font-semibold leading-[1.02] tracking-tight sm:text-6xl">
              {liveRemates.length === 1
                ? '1 remate suena el martillo ahora mismo'
                : `${liveRemates.length} remates suenan el martillo ahora mismo`}
            </h1>
          ) : (
            <h1 className="max-w-3xl text-balance text-4xl font-semibold leading-[1.02] tracking-tight sm:text-6xl">
              Remates disponibles
            </h1>
          )}
          <p className="max-w-sm text-ink-muted">
            {showLive
              ? 'Elegí uno y entrá a la sala. Si todavía no arrancó lo que buscás, abajo está todo lo que viene.'
              : 'Explorá los remates en vivo y programados a los que podés sumarte.'}
          </p>
        </header>

        {isLoading && !error && <Skeleton className="h-[38rem] w-full rounded-2xl lg:h-[34rem]" />}
        {showLive && <LiveGallery remates={liveRemates} />}
        {showLive && liveRemates.length > MAX_GALLERY_PANELS && (
          <p className="mt-3 text-sm text-ink-muted">
            Mostrando {MAX_GALLERY_PANELS} de {liveRemates.length} remates en vivo. Los demás están en la lista de
            abajo.
          </p>
        )}

        {showMosaic && (
          <section aria-labelledby="mosaic-title" className="mt-20">
            <h2 id="mosaic-title" className="mb-6 text-2xl font-semibold tracking-tight">
              Explorá por rubro
            </h2>
            <RubroMosaic remates={remates} onSelectCategory={handleSelectCategory} />
          </section>
        )}

        <div className="mt-20">
          <RemateIndex
            ref={indexRef}
            remates={remates}
            isLoading={isLoading}
            error={error}
            onRetry={reload}
            filters={filters}
            onFiltersChange={setFilters}
          />
        </div>
      </div>
    </div>
  );
}
