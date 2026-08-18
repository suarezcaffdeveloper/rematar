import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useBreadcrumb } from '../../../app/layouts/useBreadcrumb';
import { useWideLayout } from '../../../app/layouts/useWideLayout';
import { Alert } from '../../../shared/components/Alert';
import { Button } from '../../../shared/components/Button';
import { EmptyState } from '../../../shared/components/EmptyState';
import { Skeleton } from '../../../shared/components/Skeleton';
import { GavelIcon } from '../../remates/components/icons';
import { CaseCard } from '../components/CaseCard';
import { SearchFilterBar } from '../components/SearchFilterBar';
import { useVentasAdjudicadas } from '../hooks';
import type { PostAuctionCase, PostAuctionListFilters } from '../types';

const PAGE_SIZE = 4;

interface DisplayedPage {
  page: number;
  items: PostAuctionCase[];
}

/**
 * "Ventas adjudicadas" del rematador (Épica 7, Módulo 7.5), en `/ventas-adjudicadas`.
 * Buscar y filtrar por estado son requisitos explícitos del enunciado -- ver
 * `SearchFilterBar`. El backend (`PostAuctionService.list_for_rematador`) ya restringe a
 * las ventas propias; un `comprador` que llegue por URL directa recibe 403.
 *
 * Retexturizada al mismo sistema visual (`ink`/`line`, `font-display`) que ya usan la
 * Consola Operativa y el Dashboard del Rematador, sin tocar la lógica de filtros/
 * paginación.
 *
 * Transición "carrusel" entre páginas de 4 (mejora estética, sin cambios de datos):
 * `useAsyncResource` deja `data.items` "stale" (la página anterior) mientras `isLoading`
 * está en `true`, así que animar directo sobre `data.items` mostraría un slide con el
 * contenido viejo que después "salta" al contenido real recién llegado. `displayed`
 * captura una foto de `data.items` solo una vez que la carga terminó, y es esa foto (no
 * `data` directo) la que dispara el slide -- el resultado es una pausa breve (lo que
 * tarda el fetch) y después un movimiento fluido con el contenido ya correcto, en vez de
 * un corte seco. `direction` (1 = siguiente, -1 = anterior, 0 = cambio de filtros)
 * decide hacia qué lado entra/sale cada tarjeta.
 */
export function VentasAdjudicadasPage() {
  useWideLayout();
  const [filters, setFilters] = useState<PostAuctionListFilters>({});
  const [page, setPage] = useState(1);
  const [direction, setDirection] = useState<-1 | 0 | 1>(0);
  const prefersReducedMotion = useReducedMotion();

  const { data, isLoading, error } = useVentasAdjudicadas(filters, page, PAGE_SIZE);

  const [displayed, setDisplayed] = useState<DisplayedPage | null>(null);
  useEffect(() => {
    if (isLoading || !data) return;
    setDisplayed((prev) => (prev?.page === page && prev.items === data.items ? prev : { page, items: data.items }));
  }, [isLoading, data, page]);

  function handleFiltersChange(next: PostAuctionListFilters) {
    setFilters(next);
    setDirection(0);
    setPage(1);
  }

  function goToPage(next: number, dir: -1 | 1) {
    setDirection(dir);
    setPage(next);
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  useBreadcrumb([{ label: 'Mis remates', to: '/' }, { label: 'Ventas adjudicadas' }]);

  return (
    <div className="flex flex-col gap-6 font-display">
      <div className="border-b border-line pb-5">
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">Ventas adjudicadas</h1>
        <p className="mt-1 max-w-xl text-sm text-ink-muted">
          Seguimiento del proceso post-remate: contacto, pago y entrega de cada lote vendido.
        </p>
      </div>

      <SearchFilterBar value={filters} onChange={handleFiltersChange} />

      {error ? (
        <Alert variant="error">No se pudieron cargar las ventas adjudicadas.</Alert>
      ) : isLoading && !data ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
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
          <div className="relative overflow-hidden">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.div
                key={displayed?.page ?? page}
                initial={prefersReducedMotion ? undefined : { x: direction === 0 ? 0 : direction * 56, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={prefersReducedMotion ? undefined : { x: direction === 0 ? 0 : direction * -56, opacity: 0 }}
                transition={{ duration: 0.35, ease: [0.21, 0.47, 0.32, 0.98] }}
                className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
              >
                {(displayed?.items ?? data?.items ?? []).map((item) => (
                  <CaseCard key={item.id} item={item} to={`/ventas-adjudicadas/${item.id}`} perspective="rematador" />
                ))}
              </motion.div>
            </AnimatePresence>
          </div>

          {data && data.total > PAGE_SIZE && (
            <div className="flex items-center justify-between border-t border-line pt-3">
              <span className="text-xs text-ink-faint">
                {data.total} {data.total === 1 ? 'venta' : 'ventas'} · página {page} de {totalPages}
              </span>
              <div className="flex gap-2">
                <Button variant="secondary" disabled={page <= 1} onClick={() => goToPage(Math.max(1, page - 1), -1)}>
                  Anterior
                </Button>
                <Button
                  variant="secondary"
                  disabled={page >= totalPages}
                  onClick={() => goToPage(Math.min(totalPages, page + 1), 1)}
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
