import { useMemo, useState } from 'react';
import { Package, Search } from 'lucide-react';
import { useBreadcrumb } from '../../../app/layouts/useBreadcrumb';
import { useTopNavLayout } from '../../../app/layouts/useTopNavLayout';
import { Alert } from '../../../shared/components/Alert';
import { Button } from '../../../shared/components/Button';
import { Skeleton } from '../../../shared/components/Skeleton';
import { SaleCard } from '../components/sales/SaleCard';
import { SalesNumbers } from '../components/sales/SalesNumbers';
import { SalesTodo } from '../components/sales/SalesTodo';
import { StatusChangeDialog } from '../components/sales/StatusChangeDialog';
import { useAllVentasAdjudicadas } from '../hooks';
import {
  SALES_FILTERS,
  buildSalesHeadline,
  buildSalesTasks,
  computeTotals,
  filterSales,
  matchesFilter,
  nextStatus,
  sortSales,
  type SalesFilter,
} from '../sales';
import type { PostAuctionCase } from '../types';

const GRID_CLASSES = 'grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4';

function SectionHeading({ id, title, description }: { id: string; title: string; description?: string }) {
  return (
    <div className="mb-6">
      <h2 id={id} className="text-2xl font-semibold tracking-tight sm:text-3xl">
        {title}
      </h2>
      {description && <p className="mt-1.5 max-w-[60ch] text-ink-muted">{description}</p>}
    </div>
  );
}

/**
 * "Ventas adjudicadas" de la empresa (Épica 7, Módulo 7.5), en `/ventas-adjudicadas`;
 * rediseño editorial sobre el mismo sistema visual del panel principal (`BuyerTopNav`,
 * `font-display`, líneas `ink`/`line`). Trae todas las ventas de una vez (`useAllVentasAdjudicadas`)
 * y arma, de arriba a abajo:
 *
 * 1. Un titular con lo que hay por cobrar y cuántas cosas esperan.
 * 2. "Qué hacer ahora" -- las ventas que frenan un cobro o una entrega, con el botón del
 *    próximo paso en cada fila.
 * 3. "Cómo van tus ventas" -- cifras y el monto por etapa.
 * 4. "Todas tus ventas" -- galería con filtro por grupo de etapas y búsqueda; las atrasadas
 *    primero.
 *
 * El próximo paso se confirma en `StatusChangeDialog` (con observación y fecha del hecho).
 * "Atrasada" y "tiempo en este estado" son derivados en el cliente (ver `sales.ts`): el
 * backend no los calcula.
 */
export function VentasAdjudicadasPage() {
  useTopNavLayout();
  useBreadcrumb([{ label: 'Mis remates', to: '/' }, { label: 'Ventas adjudicadas' }]);
  const { data: items, isLoading, error, reload } = useAllVentasAdjudicadas();
  const [filter, setFilter] = useState<SalesFilter>('all');
  const [query, setQuery] = useState('');
  const [advancing, setAdvancing] = useState<PostAuctionCase | null>(null);
  const [now] = useState(() => Date.now());

  const hasSales = items.length > 0;
  const showContent = !isLoading && !error;
  const totals = useMemo(() => computeTotals(items, now), [items, now]);
  const tasks = useMemo(() => buildSalesTasks(items, now), [items, now]);
  const visible = useMemo(() => sortSales(filterSales(items, filter, query, now), now), [items, filter, query, now]);

  const target = advancing ? nextStatus(advancing.status) : null;

  return (
    <div className="min-h-screen bg-white font-display text-ink">
      <div className="mx-auto w-full max-w-[110rem] px-3 py-8 sm:px-6 lg:px-10">
        <header className="flex flex-col gap-5">
          <h1 className="max-w-[22ch] text-balance text-4xl font-semibold leading-[1.02] tracking-tight sm:text-6xl">
            {isLoading ? 'Ventas adjudicadas' : error ? 'Ventas adjudicadas' : hasSales ? buildSalesHeadline(totals, tasks.length) : 'Todavía no tenés ventas adjudicadas.'}
          </h1>
          <p className="max-w-[56ch] text-lg text-ink-muted">
            {hasSales || isLoading || error
              ? 'Cada lote vendido, desde el contacto con el comprador hasta la entrega.'
              : 'Cuando se adjudique un lote de uno de tus remates, la venta aparece acá automáticamente y le avisamos al comprador.'}
          </p>
        </header>

        {error && (
          <div className="mt-10">
            <Alert variant="error">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span>No se pudieron cargar las ventas adjudicadas.</span>
                <Button variant="secondary" onClick={reload}>
                  Reintentar
                </Button>
              </div>
            </Alert>
          </div>
        )}

        {isLoading && !error && (
          <div className="mt-12 flex flex-col gap-10">
            <Skeleton className="h-64 w-full rounded-2xl" />
            <div className={GRID_CLASSES}>
              {Array.from({ length: 3 }, (_, index) => (
                <Skeleton key={index} className="aspect-[4/5] w-full rounded-2xl" />
              ))}
            </div>
          </div>
        )}

        {showContent && hasSales && (
          <>
            <section aria-labelledby="todo-title" className="mt-12">
              <SectionHeading id="todo-title" title="Qué hacer ahora" description="Lo que está frenando un cobro o una entrega, ordenado por urgencia." />
              <SalesTodo tasks={tasks} onAdvance={setAdvancing} />
            </section>

            <section aria-labelledby="numbers-title" className="mt-20">
              <SectionHeading id="numbers-title" title="Cómo van tus ventas" description="Lo cobrado, lo pendiente y lo que está en camino." />
              <SalesNumbers totals={totals} />
            </section>

            <section aria-labelledby="sales-title" className="mt-20">
              <SectionHeading id="sales-title" title="Todas tus ventas" description="Cada tarjeta dice en qué etapa está y qué sigue. Las atrasadas van primero." />
              <div className="mb-8 flex flex-wrap items-center gap-x-4 gap-y-3">
                <div role="group" aria-label="Filtrar ventas" className="flex flex-wrap gap-1.5">
                  {SALES_FILTERS.map((option) => {
                    const count = items.filter((item) => matchesFilter(item, option.value, now)).length;
                    const isActive = filter === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        aria-pressed={isActive}
                        onClick={() => setFilter(option.value)}
                        className={`rounded-full border px-4 py-2 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                          isActive ? 'border-ink bg-ink text-white' : 'border-line bg-white text-ink-muted hover:border-ink hover:text-ink'
                        }`}
                      >
                        {option.label}
                        <span className="ml-1.5 font-medium tabular-nums opacity-65">{count}</span>
                      </button>
                    );
                  })}
                </div>
                <label className="relative ml-auto w-full sm:w-64">
                  <span className="sr-only">Buscar venta</span>
                  <Search aria-hidden="true" className="pointer-events-none absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
                  <input
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Buscar lote o comprador"
                    className="w-full border-0 border-b border-line-strong bg-transparent py-2 pl-6 pr-1 text-sm text-ink placeholder:text-ink-faint focus:border-ink focus:outline-none"
                  />
                </label>
              </div>

              {visible.length > 0 ? (
                <div className={GRID_CLASSES}>
                  {visible.map((item) => (
                    <SaleCard key={item.id} item={item} now={now} onAdvance={setAdvancing} />
                  ))}
                </div>
              ) : (
                <div className="grid justify-items-start gap-3">
                  <p className="text-lg font-semibold">No hay ventas con ese filtro</p>
                  <p className="text-ink-muted">Probá con otra etapa o borrá la búsqueda.</p>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setFilter('all');
                      setQuery('');
                    }}
                  >
                    Limpiar filtros
                  </Button>
                </div>
              )}
            </section>
          </>
        )}

        {showContent && !hasSales && (
          <div className="mt-12 grid justify-items-center gap-3 rounded-3xl border border-dashed border-line-strong px-6 py-16 text-center">
            <Package aria-hidden="true" className="h-8 w-8 text-ink-faint" />
            <h2 className="text-2xl font-semibold tracking-tight">Sin ventas adjudicadas</h2>
            <p className="max-w-[46ch] text-ink-muted">Cuando se adjudique un lote de uno de tus remates, el caso aparece acá automáticamente.</p>
          </div>
        )}
      </div>

      {advancing && target && (
        <StatusChangeDialog
          isOpen
          onClose={() => setAdvancing(null)}
          caseId={advancing.id}
          loteTitle={advancing.lote_title}
          buyerName={advancing.buyer_name}
          from={advancing.status}
          to={target}
          onChanged={reload}
        />
      )}
    </div>
  );
}
