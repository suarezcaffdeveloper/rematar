import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { Clock3, Search, Trophy } from 'lucide-react';
import { formatCurrency } from '../../../shared/lib/format';
import { CoverPlaceholder } from '../../remates/components/CoverPlaceholder';
import { BoxIcon } from '../../remates/components/icons';
import { CATEGORY_LABELS } from '../../remates/labels';
import type { Lote } from '../../remates/types';
import { optimizedImage } from '../../../shared/lib/image';

export interface TimedLoteCatalogProps {
  /** Todos los lotes del remate que se pueden ver (sin los cancelados). */
  lotes: Lote[];
  selectedLoteId: string | null;
  onSelect: (loteId: string) => void;
  leadingAmounts: Record<string, string | null>;
  /** Quién lidera cada lote; junto con `currentUserId` marca "Vas liderando". */
  leadingBuyerIds: Record<string, string | null>;
  currentUserId: string | null;
  currency: string;
}

type Filter = 'all' | 'open' | 'soon' | 'leading' | 'closed';
type Sort = 'closing' | 'number' | 'price';

const SOON_SECONDS = 60 * 60;
const URGENT_SECONDS = 5 * 60;

function secondsLeft(lote: Lote, now: number): number | null {
  if (lote.status !== 'open') return null;
  if (lote.timer_paused_remaining_seconds !== null) return lote.timer_paused_remaining_seconds;
  if (lote.timer_ends_at === null) return null;
  return Math.max(0, Math.round((new Date(lote.timer_ends_at).getTime() - now) / 1000));
}

/** "2 d 3 h", "3 h 10 min", "52 min" o "4:17" cuando ya queda poco: lo justo para
 * escanear un mosaico. */
function formatCompact(seconds: number): string {
  if (seconds <= 0) return 'Cerrando';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days} d ${hours} h`;
  if (hours > 0) return `${hours} h ${minutes} min`;
  if (seconds >= URGENT_SECONDS) return `${minutes} min`;
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

function currentAmount(lote: Lote, leadingAmounts: Record<string, string | null>): number {
  return Number(leadingAmounts[lote.id] ?? lote.base_price);
}

function priceLine(lote: Lote, leadingAmounts: Record<string, string | null>, currency: string) {
  if (lote.status === 'closed_sold') {
    return { label: 'Vendido', value: formatCurrency(lote.final_price ?? lote.base_price, currency) };
  }
  if (lote.status === 'closed_unsold') return { label: 'Cierre', value: 'Sin ofertas' };
  const leading = leadingAmounts[lote.id];
  if (lote.status === 'open' && leading !== null && leading !== undefined) {
    return { label: 'Oferta actual', value: formatCurrency(leading, currency) };
  }
  return { label: 'Base', value: formatCurrency(lote.base_price, currency) };
}

const FILTER_LABELS: Record<Filter, string> = {
  all: 'Todos',
  open: 'Abiertos',
  soon: 'Cierran pronto',
  leading: 'Voy liderando',
  closed: 'Cerrados',
};

const STATUS_RANK: Record<Lote['status'], number> = {
  open: 0,
  pending: 1,
  closed_sold: 2,
  closed_unsold: 2,
  cancelled: 3,
};

/**
 * El catálogo de la Sala Timed: todos los lotes del remate como un mosaico de fotos, con
 * buscador (número, título o rubro), filtros y orden -- por defecto, el que cierra antes
 * primero. Cada lote muestra su número, cuánto falta para que cierre, su precio y, si
 * vas liderando, una marca. Tocar un lote lo pasa a la vitrina de arriba
 * (`onSelect`); el elegido queda marcado "Lo estás viendo".
 *
 * Los filtros y el buscador solo afectan a este mosaico, nunca a la vitrina: el lote que
 * estás mirando no desaparece porque busques otra cosa. "Voy liderando" solo aparece si hay
 * algún lote en ese estado.
 */
export function TimedLoteCatalog({
  lotes,
  selectedLoteId,
  onSelect,
  leadingAmounts,
  leadingBuyerIds,
  currentUserId,
  currency,
}: TimedLoteCatalogProps) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('closing');

  // Un solo reloj para todo el mosaico: alcanza con refrescar cada segundo los tiempos.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const isLeading = (lote: Lote) =>
    currentUserId !== null && lote.status === 'open' && leadingBuyerIds[lote.id] === currentUserId;
  const hasLeading = lotes.some(isLeading);

  const filters: Filter[] = hasLeading
    ? ['all', 'open', 'soon', 'leading', 'closed']
    : ['all', 'open', 'soon', 'closed'];
  // Si el filtro activo ya no tiene sentido (dejaste de liderar), se vuelve a "Todos".
  const activeFilter: Filter = filters.includes(filter) ? filter : 'all';

  const visible = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const filtered = lotes.filter((lote) => {
      if (
        normalizedQuery &&
        !lote.title.toLowerCase().includes(normalizedQuery) &&
        !lote.lot_number.toLowerCase().includes(normalizedQuery) &&
        !CATEGORY_LABELS[lote.category].toLowerCase().includes(normalizedQuery)
      ) {
        return false;
      }
      if (activeFilter === 'open') return lote.status === 'open';
      if (activeFilter === 'soon') {
        const left = secondsLeft(lote, now);
        return left !== null && left <= SOON_SECONDS;
      }
      if (activeFilter === 'leading') return currentUserId !== null && leadingBuyerIds[lote.id] === currentUserId && lote.status === 'open';
      if (activeFilter === 'closed') return lote.status === 'closed_sold' || lote.status === 'closed_unsold';
      return true;
    });

    return [...filtered].sort((a, b) => {
      if (sort === 'number') return a.display_order - b.display_order;
      if (sort === 'price') return currentAmount(b, leadingAmounts) - currentAmount(a, leadingAmounts);
      if (STATUS_RANK[a.status] !== STATUS_RANK[b.status]) return STATUS_RANK[a.status] - STATUS_RANK[b.status];
      return (secondsLeft(a, now) ?? Infinity) - (secondsLeft(b, now) ?? Infinity) || a.display_order - b.display_order;
    });
  }, [lotes, query, activeFilter, sort, now, leadingAmounts, leadingBuyerIds, currentUserId]);

  return (
    <section aria-labelledby="timed-catalog-title" className="mt-14 border-t border-line pb-16 pt-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 id="timed-catalog-title" className="text-xl font-bold tracking-tight text-ink">
            Todos los lotes
          </h2>
          <p className="mt-0.5 text-sm text-ink-muted">
            {visible.length === lotes.length
              ? `${lotes.length} ${lotes.length === 1 ? 'lote' : 'lotes'} en este remate`
              : `${visible.length} de ${lotes.length} lotes`}
            . Tocá uno para verlo arriba.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 border-b border-line-strong pb-1.5 focus-within:border-ink">
            <Search aria-hidden="true" className="h-4 w-4 shrink-0 text-ink-faint" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar lote"
              aria-label="Buscar lote por número, título o categoría"
              className="w-44 bg-transparent text-sm text-ink placeholder:text-ink-faint focus:outline-none"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-ink-muted">
            Ordenar
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as Sort)}
              className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-sm text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <option value="closing">Cierran antes</option>
              <option value="number">Número de lote</option>
              <option value="price">Mayor precio</option>
            </select>
          </label>
        </div>
      </div>

      <div role="group" aria-label="Filtrar lotes" className="mt-5 flex flex-wrap gap-2">
        {filters.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setFilter(id)}
            aria-pressed={activeFilter === id}
            className={clsx(
              'rounded-full border px-3.5 py-1.5 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
              activeFilter === id
                ? 'border-ink bg-ink font-semibold text-white'
                : 'border-line text-ink-muted hover:border-ink hover:text-ink',
            )}
          >
            {FILTER_LABELS[id]}
          </button>
        ))}
      </div>

      {visible.length > 0 ? (
        <ul className="mt-6 grid grid-cols-1 gap-x-6 gap-y-9 min-[520px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {visible.map((lote) => (
            <CatalogTile
              key={lote.id}
              lote={lote}
              active={lote.id === selectedLoteId}
              leading={isLeading(lote)}
              secondsLeft={secondsLeft(lote, now)}
              price={priceLine(lote, leadingAmounts, currency)}
              onSelect={() => onSelect(lote.id)}
            />
          ))}
        </ul>
      ) : (
        <p className="mt-10 text-center text-sm text-ink-muted">Ningún lote coincide con lo que buscás.</p>
      )}
    </section>
  );
}

function CatalogTile({
  lote,
  active,
  leading,
  secondsLeft: left,
  price,
  onSelect,
}: {
  lote: Lote;
  active: boolean;
  leading: boolean;
  secondsLeft: number | null;
  price: { label: string; value: string };
  onSelect: () => void;
}) {
  const closed = lote.status === 'closed_sold' || lote.status === 'closed_unsold';
  const cover = [...lote.images].sort((a, b) => a.order - b.order)[0];
  const paused = lote.status === 'open' && lote.timer_paused_remaining_seconds !== null;

  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={active ? 'true' : undefined}
        className="group block w-full text-left focus:outline-none"
      >
        <span
          className={clsx(
            'relative block aspect-[4/3] overflow-hidden rounded-xl bg-surface-subtle ring-offset-2 transition group-focus-visible:ring-2 group-focus-visible:ring-brand-500',
            active && 'ring-2 ring-ink',
          )}
        >
          {cover ? (
            <img
              src={optimizedImage(cover.url, 480)}
              loading="lazy" decoding="async"
              alt=""
              className={clsx(
                'h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]',
                closed && 'opacity-60 grayscale',
              )}
            />
          ) : (
            <CoverPlaceholder
              className="h-full w-full"
              icon={<BoxIcon className="h-8 w-8 text-brand-300" />}
            />
          )}
          <span className="absolute left-2.5 top-2.5 rounded-full bg-white/95 px-2.5 py-1 text-xs font-semibold text-ink shadow-sm">
            Lote {lote.lot_number}
          </span>
          {left !== null && (
            <span
              className={clsx(
                'absolute right-2.5 top-2.5 inline-flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-1 font-mono text-xs font-semibold tabular-nums shadow-sm',
                paused ? 'text-ink-muted' : left <= URGENT_SECONDS ? 'text-danger-600' : left <= SOON_SECONDS ? 'text-warning-700' : 'text-ink-muted',
              )}
            >
              <Clock3 aria-hidden="true" className="h-3 w-3" />
              {paused ? 'Pausado' : formatCompact(left)}
            </span>
          )}
          {lote.status === 'pending' && (
            <span className="absolute right-2.5 top-2.5 rounded-full bg-white/95 px-2.5 py-1 text-xs font-semibold text-brand-700 shadow-sm">
              Abre pronto
            </span>
          )}
          {closed && (
            <span className="absolute inset-x-0 bottom-0 bg-ink/70 px-3 py-1.5 text-xs font-semibold text-white">
              {lote.status === 'closed_sold' ? 'Vendido' : 'Cerró sin ofertas'}
            </span>
          )}
          {active && (
            <span
              className={clsx(
                'absolute left-2.5 rounded-full bg-ink px-2.5 py-1 text-xs font-semibold text-white',
                // Un lote cerrado lleva una franja al pie de la foto: la marca va arriba de ella.
                closed ? 'bottom-10' : 'bottom-2.5',
              )}
            >
              Lo estás viendo
            </span>
          )}
        </span>
        <span className="mt-2.5 block">
          <span className="line-clamp-2 block text-sm font-semibold leading-snug text-ink">{lote.title}</span>
          <span className="mt-1 block text-xs text-ink-faint">{price.label}</span>
          <span className="font-mono text-base font-bold tabular-nums text-ink">{price.value}</span>
          {leading && (
            <span className="mt-1.5 flex">
              <span className="inline-flex items-center gap-1 rounded-full bg-success-50 px-2 py-0.5 text-[11px] font-semibold text-success-700">
                <Trophy aria-hidden="true" className="h-3 w-3" />
                Vas liderando
              </span>
            </span>
          )}
        </span>
      </button>
    </li>
  );
}
