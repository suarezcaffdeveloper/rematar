import { useMemo, useState } from 'react';
import { History, Search } from 'lucide-react';
import { useAuth } from '../../auth/hooks';
import { Alert } from '../../../shared/components/Alert';
import { Button } from '../../../shared/components/Button';
import { Skeleton } from '../../../shared/components/Skeleton';
import { useAllVentasAdjudicadas } from '../../postauction/hooks';
import { statusIndex } from '../../postauction/sales';
import { formatCompactMoney } from '../../rematador/dashboard';
import { useRemates } from '../../remates/hooks';
import { useAllFinishedRemates } from '../hooks';
import {
  HISTORY_CURRENCY,
  HISTORY_PERIODS,
  HISTORY_SORTS,
  buildHistoryHeadline,
  computeHistoryTotals,
  filterAndSortHistory,
  inPeriod,
  matchesStatus,
  type HistoryPeriod,
  type HistorySort,
  type HistoryStatusFilter,
} from '../summary';
import { FinishedRemateCard } from './FinishedRemateCard';

const GRID_CLASSES = 'grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 xl:grid-cols-3';

const STATUS_FILTERS: Array<{ value: HistoryStatusFilter; label: string }> = [
  { value: 'all', label: 'Todos' },
  { value: 'finished', label: 'Finalizados' },
  { value: 'cancelled', label: 'Cancelados' },
];

export interface FinishedRemateListProps {
  /** `true` en el panel global del admin: muestra de quién es cada remate, usa un titular
   * más chico (la pestaña ya es el contexto) y no cruza con las ventas (son de la empresa). */
  showOwner?: boolean;
}

/**
 * Historial de remates terminados (Épica 7, Módulo 7.3; rediseño editorial): un titular que
 * dice cuánto se vendió en el período elegido, cuatro cifras, filtros (período, estado,
 * orden, búsqueda) y las tarjetas de cada remate. Trae la lista completa de una vez
 * (`useAllFinishedRemates`) y filtra en el cliente -- el backend no filtra por estado.
 *
 * Reutilizado por `RemateHistoryListPage` (empresa, `/historial`) y `AdminHistoryPanel`
 * (admin). El backend (`HistoryService.list_finished`) ya resuelve qué remates ve cada
 * rol; este componente no necesita saber quién lo mira. Para la empresa, además, cruza con
 * sus remates (portada) y con sus ventas adjudicadas (cuáles quedaron sin cobrar).
 */
export function FinishedRemateList({ showOwner = false }: FinishedRemateListProps) {
  const { user } = useAuth();
  const { data: items, isLoading, error, reload } = useAllFinishedRemates();
  const { remates } = useRemates({ ownerId: user?.id ?? '', enabled: !showOwner && Boolean(user?.id) });
  const { data: ventas, isLoading: isVentasLoading } = useAllVentasAdjudicadas({ enabled: !showOwner });
  const [period, setPeriod] = useState<HistoryPeriod>('all');
  const [status, setStatus] = useState<HistoryStatusFilter>('all');
  const [sort, setSort] = useState<HistorySort>('recent');
  const [query, setQuery] = useState('');
  const [now] = useState(() => Date.now());

  const coverById = useMemo(() => new Map(remates.map((remate) => [remate.id, remate.cover_image_url])), [remates]);
  const unpaidByRemate = useMemo(() => {
    const map = new Map<string, number>();
    for (const venta of ventas) {
      if (statusIndex(venta.status) <= 2) map.set(venta.remate_id, (map.get(venta.remate_id) ?? 0) + 1);
    }
    return map;
  }, [ventas]);

  const inScope = useMemo(() => items.filter((item) => inPeriod(item, period, now)), [items, period, now]);
  const totals = useMemo(() => computeHistoryTotals(inScope.filter((item) => matchesStatus(item, 'all'))), [inScope]);
  const visible = useMemo(() => filterAndSortHistory(items, { period, status, query, sort }, now), [items, period, status, query, sort, now]);
  const unpaidInScope = inScope.filter((item) => item.status !== 'cancelled').reduce((acc, item) => acc + (unpaidByRemate.get(item.id) ?? 0), 0);
  const showUnpaid = !showOwner && !isVentasLoading;

  const Heading = showOwner ? 'h2' : 'h1';
  const hasAny = items.length > 0;

  const numbers = [
    { value: formatCompactMoney(totals.soldSum, HISTORY_CURRENCY), label: 'Vendido', detail: 'en remates finalizados' },
    {
      value: String(totals.finishedCount),
      label: totals.finishedCount === 1 ? 'Remate cerrado' : 'Remates cerrados',
      detail: totals.cancelledCount > 0 ? `y ${totals.cancelledCount} ${totals.cancelledCount === 1 ? 'cancelado' : 'cancelados'}` : 'ninguno cancelado',
    },
    {
      value: totals.soldPercent === null ? '—' : `${totals.soldPercent}%`,
      label: 'Lotes vendidos',
      detail: totals.lotesTotal > 0 ? `${totals.lotesSold} de ${totals.lotesTotal} lotes` : 'sin lotes en el período',
    },
    ...(showOwner
      ? []
      : [{ value: showUnpaid ? String(unpaidInScope) : '—', label: 'Ventas sin cobrar', detail: 'de estos remates' }]),
  ];

  return (
    <div className="font-display text-ink">
      <header className="flex flex-col gap-5">
        {!showOwner && <p className="text-ink-muted">Historial</p>}
        <Heading
          className={`max-w-[22ch] text-balance font-semibold tracking-tight ${
            showOwner ? 'text-2xl sm:text-3xl' : 'text-4xl leading-[1.02] sm:text-6xl'
          }`}
        >
          {isLoading ? 'Historial de remates' : error ? 'Historial de remates' : hasAny ? buildHistoryHeadline(period, totals) : 'Todavía no tenés remates terminados.'}
        </Heading>
        {!showOwner && (
          <p className="max-w-[58ch] text-lg text-ink-muted">
            {hasAny || isLoading || error
              ? 'Acá están los resultados de tus remates que ya terminaron o se cancelaron. Elegí uno para ver cómo le fue, lote por lote.'
              : 'Cuando uno de tus remates termine o se cancele, su resultado aparece acá: cuánto vendiste, quién ganó cada lote y qué falta cobrar.'}
          </p>
        )}
      </header>

      {error && (
        <div className="mt-10">
          <Alert variant="error">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>No se pudo cargar el historial de remates.</span>
              <Button variant="secondary" onClick={reload}>
                Reintentar
              </Button>
            </div>
          </Alert>
        </div>
      )}

      {isLoading && !error && (
        <div className="mt-12 flex flex-col gap-10">
          <Skeleton className="h-28 w-full rounded-2xl" />
          <div className={GRID_CLASSES}>
            {Array.from({ length: 3 }, (_, index) => (
              <Skeleton key={index} className="aspect-[4/5] w-full rounded-2xl" />
            ))}
          </div>
        </div>
      )}

      {!isLoading && !error && !hasAny && (
        <div className="mt-12 grid justify-items-center gap-3 rounded-3xl border border-dashed border-line-strong px-6 py-16 text-center">
          <History aria-hidden="true" className="h-8 w-8 text-ink-faint" />
          <h2 className="text-2xl font-semibold tracking-tight">Sin remates en el historial</h2>
          <p className="max-w-[46ch] text-ink-muted">Cuando un remate termine o se cancele, aparece acá.</p>
        </div>
      )}

      {!isLoading && !error && hasAny && (
        <>
          <section aria-label="Resumen del período" className="mt-12">
            <dl className={`grid grid-cols-2 border-t border-ink ${numbers.length === 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>
              {numbers.map((item) => (
                <div
                  key={item.label}
                  className="flex flex-col gap-1.5 border-b border-line py-6 pr-4 lg:border-b-0 lg:border-l lg:px-6 lg:first:border-l-0 lg:first:pl-0"
                >
                  <dd className="order-1 text-3xl font-semibold leading-none tracking-tight tabular-nums sm:text-4xl lg:text-5xl">{item.value}</dd>
                  <dt className="order-2 mt-1 font-semibold">{item.label}</dt>
                  <dd className="order-3 text-sm text-ink-muted">{item.detail}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section aria-labelledby="remates-title" className="mt-20">
            <h2 id="remates-title" className="mb-6 text-2xl font-semibold tracking-tight sm:text-3xl">
              Tus remates
            </h2>
            <div className="mb-8 flex flex-wrap items-center gap-x-4 gap-y-3">
              <div role="group" aria-label="Período" className="flex flex-wrap gap-1.5">
                {HISTORY_PERIODS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={period === option.value}
                    onClick={() => setPeriod(option.value)}
                    className={`rounded-full border px-4 py-2 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                      period === option.value ? 'border-ink bg-ink text-white' : 'border-line bg-white text-ink-muted hover:border-ink hover:text-ink'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <div role="group" aria-label="Estado" className="flex flex-wrap gap-1.5">
                {STATUS_FILTERS.map((option) => {
                  const count = inScope.filter((item) => matchesStatus(item, option.value)).length;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={status === option.value}
                      onClick={() => setStatus(option.value)}
                      className={`rounded-full border px-4 py-2 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                        status === option.value ? 'border-ink bg-ink text-white' : 'border-line bg-white text-ink-muted hover:border-ink hover:text-ink'
                      }`}
                    >
                      {option.label}
                      <span className="ml-1.5 font-medium tabular-nums opacity-65">{count}</span>
                    </button>
                  );
                })}
              </div>
              <label className="sr-only" htmlFor="history-sort">
                Ordenar
              </label>
              <select
                id="history-sort"
                value={sort}
                onChange={(event) => setSort(event.target.value as HistorySort)}
                className="rounded-full border border-line-strong bg-white px-4 py-2 text-sm text-ink focus:border-ink focus:outline-none"
              >
                {HISTORY_SORTS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <label className="relative ml-auto w-full sm:w-56">
                <span className="sr-only">Buscar remate</span>
                <Search aria-hidden="true" className="pointer-events-none absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Buscar por nombre"
                  className="w-full border-0 border-b border-line-strong bg-transparent py-2 pl-6 pr-1 text-sm text-ink placeholder:text-ink-faint focus:border-ink focus:outline-none"
                />
              </label>
            </div>

            {visible.length > 0 ? (
              <div className={GRID_CLASSES}>
                {visible.map((item) => (
                  <FinishedRemateCard
                    key={item.id}
                    remate={item}
                    showOwner={showOwner}
                    coverImageUrl={coverById.get(item.id) ?? null}
                    unpaidCount={showUnpaid ? (unpaidByRemate.get(item.id) ?? 0) : null}
                  />
                ))}
              </div>
            ) : (
              <div className="grid justify-items-start gap-3">
                <p className="text-lg font-semibold">No hay remates con ese filtro</p>
                <p className="text-ink-muted">Probá con otro período o borrá la búsqueda.</p>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setPeriod('all');
                    setStatus('all');
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
    </div>
  );
}
