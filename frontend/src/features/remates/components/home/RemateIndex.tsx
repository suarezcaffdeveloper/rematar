import { forwardRef, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, useMotionValue, useSpring } from 'framer-motion';
import { ArrowUpRight, Search, Timer } from 'lucide-react';
import { Alert } from '../../../../shared/components/Alert';
import { Button } from '../../../../shared/components/Button';
import { EmptyState } from '../../../../shared/components/EmptyState';
import { Pagination } from '../../../../shared/components/Pagination';
import { Skeleton } from '../../../../shared/components/Skeleton';
import { usePagedList } from '../../../../shared/hooks/usePagedList';
import type { NormalizedApiError } from '../../../../shared/api/errors';
import {
  AUCTION_TYPE_LABELS,
  AUCTION_TYPE_OPTIONS,
  CATEGORY_LABELS,
  CATEGORY_OPTIONS,
  CATEGORY_SHORT_LABELS,
  STATUS_LABELS,
} from '../../labels';
import { DEFAULT_FILTERS, filterAndSortRemates, type RemateFilters } from '../../filtering';
import { useLoteCount } from '../../hooks';
import type { Remate, RemateAuctionType, RemateCategory } from '../../types';
import { GavelIcon } from '../icons';
import { CATEGORY_ICONS } from './categoryVisuals';
import { formatSchedule, formatWeekdayShort, remateDay, sameDay, upcomingDays } from './homeDates';
import { LiveDot } from './LiveDot';
import { RemateCover } from './RemateCover';

const PAGE_SIZE = 12;
const SKELETON_ROWS = 6;
const CONTROL_CLASSES =
  'rounded-full border border-line bg-white py-2 pl-3.5 pr-8 text-sm text-ink-muted transition-colors hover:border-ink-faint focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500';

export interface RemateIndexProps {
  remates: Remate[];
  isLoading: boolean;
  error: NormalizedApiError | null;
  onRetry: () => void;
  filters: RemateFilters;
  onFiltersChange: (filters: RemateFilters) => void;
}

/**
 * "Todos los remates": índice tipográfico en vez de grilla de tarjetas. Se filtra por
 * texto, rubro y tipo (los mismos tres filtros del dashboard anterior, controlados por la
 * página para que las fichas del mosaico también puedan filtrar) y, acá adentro, por día
 * de la semana. Al pasar el mouse por una fila, las demás se atenúan y la portada del
 * remate sigue al cursor. Paginado client-side, igual que antes.
 */
export const RemateIndex = forwardRef<HTMLElement, RemateIndexProps>(function RemateIndex(
  { remates, isLoading, error, onRetry, filters, onFiltersChange },
  ref,
) {
  const [day, setDay] = useState<Date | 'all'>('all');
  const [hovered, setHovered] = useState<Remate | null>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 320, damping: 32, mass: 0.6 });
  const sy = useSpring(y, { stiffness: 320, damping: 32, mass: 0.6 });

  const days = useMemo(() => upcomingDays(), []);
  const filtered = useMemo(() => filterAndSortRemates(remates, filters), [remates, filters]);
  const dayCounts = useMemo(
    () =>
      days.map((d) =>
        filtered.filter((r) => {
          const rd = remateDay(r);
          return rd !== null && sameDay(rd, d);
        }).length,
      ),
    [days, filtered],
  );
  const rows = useMemo(() => {
    if (day === 'all') return filtered;
    return filtered.filter((r) => {
      const rd = remateDay(r);
      return rd !== null && sameDay(rd, day);
    });
  }, [filtered, day]);

  const { page, totalPages, pageItems, goToPage } = usePagedList(rows, PAGE_SIZE);

  // Cualquier cambio de filtro (incluidos los que vienen del mosaico) o de día vuelve a la
  // primera página -- sin esto se podría quedar en una página que ya no existe.
  useEffect(() => {
    goToPage(1);
  }, [filters, day, goToPage]);

  const hasAnyRemates = remates.length > 0;
  const showList = !isLoading && !error && rows.length > 0;

  function clearFilters() {
    onFiltersChange(DEFAULT_FILTERS);
    setDay('all');
  }

  function handlePageChange(next: number) {
    goToPage(next);
    (ref as React.RefObject<HTMLElement | null> | null)?.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <section ref={ref} aria-labelledby="index-title" className="scroll-mt-24 pb-16">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <h2 id="index-title" className="text-2xl font-semibold tracking-tight">
          Todos los remates
        </h2>
        <label className="relative block w-full lg:w-80">
          <span className="sr-only">Buscar remates por título</span>
          <Search
            className="pointer-events-none absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint"
            aria-hidden="true"
          />
          <input
            type="search"
            value={filters.search}
            onChange={(e) => onFiltersChange({ ...filters, search: e.target.value })}
            placeholder="Buscar por título"
            aria-label="Buscar remates por título"
            className="w-full border-b border-line-strong bg-transparent py-2 pl-7 pr-2 text-base outline-none transition-colors placeholder:text-ink-faint focus:border-ink"
          />
        </label>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Filtrar por día">
          <DayChip selected={day === 'all'} onClick={() => setDay('all')}>
            <span className="text-sm font-semibold">Todos</span>
            <span className="text-xs text-ink-muted">{filtered.length}</span>
          </DayChip>
          {days.map((d, i) => (
            <DayChip
              key={d.toDateString()}
              selected={day !== 'all' && sameDay(day, d)}
              disabled={dayCounts[i] === 0}
              onClick={() => setDay(d)}
            >
              <span className="text-xs capitalize text-ink-muted">{i === 0 ? 'Hoy' : formatWeekdayShort(d)}</span>
              <span className="text-lg font-semibold leading-none tabular-nums">{d.getDate()}</span>
              <span className="flex h-1.5 gap-0.5" role="img" aria-label={`${dayCounts[i]} remates`}>
                {Array.from({ length: Math.min(dayCounts[i], 5) }, (_, k) => (
                  <span key={k} className="h-1.5 w-1.5 rounded-full bg-current opacity-60" />
                ))}
              </span>
            </DayChip>
          ))}
        </div>

        <div className="flex flex-wrap gap-2 lg:ml-auto">
          <select
            aria-label="Filtrar por categoría"
            value={filters.category}
            onChange={(e) => onFiltersChange({ ...filters, category: e.target.value as RemateCategory | 'all' })}
            className={CONTROL_CLASSES}
          >
            <option value="all">Todas las categorías</option>
            {CATEGORY_OPTIONS.map((category) => (
              <option key={category} value={category}>
                {CATEGORY_LABELS[category]}
              </option>
            ))}
          </select>
          <select
            aria-label="Filtrar por tipo de remate"
            value={filters.auctionType}
            onChange={(e) => onFiltersChange({ ...filters, auctionType: e.target.value as RemateAuctionType | 'all' })}
            className={CONTROL_CLASSES}
          >
            <option value="all">Todo tipo de remate</option>
            {AUCTION_TYPE_OPTIONS.map((auctionType) => (
              <option key={auctionType} value={auctionType}>
                {AUCTION_TYPE_LABELS[auctionType]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="mt-6">
          <Alert variant="error">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>{error.message}</span>
              <Button variant="secondary" onClick={onRetry}>
                Reintentar
              </Button>
            </div>
          </Alert>
        </div>
      )}

      {isLoading && !error && (
        <div className="mt-6 border-t border-ink" aria-hidden="true">
          {Array.from({ length: SKELETON_ROWS }, (_, i) => (
            <div key={i} className="flex items-center justify-between gap-6 border-b border-line py-5">
              <div className="flex-1">
                <Skeleton className="h-6 w-2/3" />
                <Skeleton className="mt-2 h-3.5 w-28" />
              </div>
              <Skeleton className="hidden h-4 w-40 md:block" />
            </div>
          ))}
        </div>
      )}

      {!isLoading && !error && !hasAnyRemates && (
        <div className="mt-6">
          <EmptyState
            icon={<GavelIcon className="h-10 w-10" />}
            title="Todavía no hay remates disponibles"
            description="Cuando un martillero programe un remate, vas a poder verlo acá."
          />
        </div>
      )}

      {!isLoading && !error && hasAnyRemates && rows.length === 0 && (
        <div className="mt-6">
          <EmptyState
            icon={<GavelIcon className="h-10 w-10" />}
            title="Ningún remate coincide con tu búsqueda"
            description="Probá con otro título, otro día, o quitá alguno de los filtros aplicados."
            action={
              <Button variant="secondary" onClick={clearFilters}>
                Limpiar filtros
              </Button>
            }
          />
        </div>
      )}

      {showList && (
        <>
          <ul
            className="mt-6 border-t border-ink"
            onMouseMove={(e) => {
              x.set(e.clientX + 28);
              y.set(e.clientY - 96);
            }}
            onMouseLeave={() => setHovered(null)}
          >
            <AnimatePresence initial={false} mode="popLayout">
              {pageItems.map((remate) => (
                <IndexRow
                  key={remate.id}
                  remate={remate}
                  dimmed={hovered !== null && hovered.id !== remate.id}
                  onHover={(e) => {
                    // Posiciona la portada ya en la entrada: sin esto aparecería un
                    // instante en (0, 0) hasta el primer `mousemove` de la lista.
                    x.jump(e.clientX + 28);
                    y.jump(e.clientY - 96);
                    if (hovered === null) {
                      sx.jump(e.clientX + 28);
                      sy.jump(e.clientY - 96);
                    }
                    setHovered(remate);
                  }}
                  onFocusRow={() => setHovered(remate)}
                  onBlurRow={() => setHovered(null)}
                />
              ))}
            </AnimatePresence>
          </ul>

          <div className="mt-8">
            <Pagination page={page} totalPages={totalPages} onPageChange={handlePageChange} />
          </div>
        </>
      )}

      {/* Portada flotante que sigue al cursor -- solo con mouse (md+), decorativa. */}
      <AnimatePresence>
        {hovered && (
          <motion.div
            key="preview"
            aria-hidden="true"
            className="pointer-events-none fixed left-0 top-0 z-30 hidden h-44 w-60 overflow-hidden rounded-xl bg-surface-subtle shadow-2xl ring-1 ring-black/5 md:block"
            style={{ x: sx, y: sy }}
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.92 }}
            transition={{ duration: 0.2 }}
          >
            <RemateCover remate={hovered} className="h-full w-full" />
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
});

function IndexRow({
  remate,
  dimmed,
  onHover,
  onFocusRow,
  onBlurRow,
}: {
  remate: Remate;
  dimmed: boolean;
  onHover: (e: React.MouseEvent) => void;
  onFocusRow: () => void;
  onBlurRow: () => void;
}) {
  const Icon = CATEGORY_ICONS[remate.category];
  const loteCount = useLoteCount(remate.id);

  return (
    <motion.li
      layout
      initial={{ opacity: 0 }}
      animate={{ opacity: dimmed ? 0.35 : 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="border-b border-line"
      onMouseEnter={onHover}
    >
      <Link
        to={`/remates/${remate.id}`}
        onFocus={onFocusRow}
        onBlur={onBlurRow}
        className="group grid grid-cols-[1fr_auto] items-center gap-x-6 gap-y-1 py-5 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 md:grid-cols-[11rem_minmax(0,1fr)_12rem_5rem_auto]"
      >
        <span className="order-2 text-sm md:order-none">
          <RowStatus remate={remate} />
        </span>
        <span className="order-1 col-span-2 min-w-0 md:order-none md:col-span-1">
          <span className="block truncate text-xl font-medium tracking-tight transition-transform duration-300 group-hover:translate-x-1 sm:text-2xl">
            {remate.title}
          </span>
          <span className="mt-0.5 flex items-center gap-1.5 text-sm text-ink-muted">
            <Icon className="h-4 w-4 text-ink-faint" aria-hidden="true" />
            {CATEGORY_SHORT_LABELS[remate.category]}
            {(remate.auction_type ?? 'live') === 'timed' && (
              <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
                <Timer className="h-3 w-3" aria-hidden="true" /> Timed
              </span>
            )}
          </span>
        </span>
        <span className="hidden truncate text-sm text-ink-muted md:block">{remate.location}</span>
        <span className="hidden text-sm tabular-nums text-ink-muted md:block">
          {loteCount === null ? '' : `${loteCount} ${loteCount === 1 ? 'lote' : 'lotes'}`}
        </span>
        <ArrowUpRight
          className="order-3 h-5 w-5 justify-self-end text-ink-faint transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-brand-600 md:order-none"
          aria-hidden="true"
        />
      </Link>
    </motion.li>
  );
}

function RowStatus({ remate }: { remate: Remate }) {
  switch (remate.status) {
    case 'live':
      return (
        <span className="inline-flex items-center gap-2 font-medium text-success-700">
          <LiveDot /> En vivo
        </span>
      );
    case 'cancelled':
      return <span className="font-medium text-danger-600">{STATUS_LABELS.cancelled}</span>;
    case 'finished':
    case 'paused':
      return <span className="text-ink-muted">{STATUS_LABELS[remate.status]}</span>;
    default:
      return (
        <span className="tabular-nums text-ink-muted">
          {remate.starts_at ? formatSchedule(remate.starts_at) : 'Sin fecha'}
        </span>
      );
  }
}

function DayChip({
  selected,
  disabled,
  onClick,
  children,
}: {
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={selected}
      onClick={onClick}
      className={`flex min-w-[4.5rem] shrink-0 flex-col items-center gap-1 rounded-xl border px-4 py-2.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40 ${
        selected ? 'border-ink bg-ink text-white [&_.text-ink-muted]:text-white/70' : 'border-line bg-white hover:border-ink-faint'
      }`}
    >
      {children}
    </button>
  );
}
