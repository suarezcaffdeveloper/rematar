import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { ArrowLeft, Search } from 'lucide-react';
import { CATEGORY_LABELS } from '../../features/remates/labels';
import type { Lote } from '../../features/remates/types';
import { formatDateTime } from '../../shared/lib/format';
import { PreviewBuyerNav } from './previewInicio/PreviewBuyerNav';
import { LiveDot } from './previewInicio/shared';
import {
  BidPanel,
  Clock,
  Description,
  Gallery,
  GuaranteeStub,
  MineTag,
  RecentOffers,
  TimeChip,
  money,
  priceOf,
  timeLeft,
  useNow,
} from './previewTimed/parts';
import { photoPosition, useTimedSim, type TimedSim } from './previewTimed/sim';

type Filter = 'all' | 'open' | 'soon' | 'mine' | 'closed';
type Sort = 'closing' | 'number' | 'price';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'Todos' },
  { id: 'open', label: 'Abiertos' },
  { id: 'soon', label: 'Cierran pronto' },
  { id: 'mine', label: 'Mis ofertas' },
  { id: 'closed', label: 'Cerrados' },
];

/** Un lote del catálogo de abajo: la foto manda, y se lee rápido cuánto vale y cuánto falta. */
function LoteTile({
  sim,
  lote,
  index,
  active,
  onSelect,
}: {
  sim: TimedSim;
  lote: Lote;
  index: number;
  active: boolean;
  onSelect: () => void;
}) {
  const price = priceOf(sim, lote);
  const closed = lote.status === 'closed_sold' || lote.status === 'closed_unsold';
  const offerCount = (sim.offersByLote[lote.id] ?? []).length;
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={active ? 'true' : undefined}
        className="group block w-full text-left focus-visible:outline-none"
      >
        <span
          className={clsx(
            'relative block aspect-[4/3] overflow-hidden rounded-xl bg-surface-subtle ring-offset-2 transition group-focus-visible:ring-2 group-focus-visible:ring-brand-600',
            active ? 'ring-2 ring-ink' : 'ring-0',
          )}
        >
          <img
            src={lote.images[0]?.url}
            alt=""
            className={clsx(
              'h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]',
              closed && 'opacity-60 grayscale',
            )}
            style={{ objectPosition: photoPosition(index) }}
          />
          <span className="absolute left-2.5 top-2.5 rounded-full bg-white/95 px-2.5 py-1 text-xs font-semibold text-ink shadow-sm">
            Lote {lote.lot_number}
          </span>
          {lote.status === 'open' && (
            <span className="absolute right-2.5 top-2.5 rounded-full bg-white/95 px-2.5 py-1 shadow-sm">
              <TimeChip lote={lote} />
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
            <span className="absolute bottom-2.5 left-2.5 rounded-full bg-ink px-2.5 py-1 text-xs font-semibold text-white">
              Lo estás viendo
            </span>
          )}
        </span>
        <span className="mt-2.5 block">
          <span className="line-clamp-2 block text-sm font-semibold leading-snug text-ink">{lote.title}</span>
          <span className="mt-1 flex items-baseline justify-between gap-2">
            <span>
              <span className="block text-xs text-ink-faint">{price.label}</span>
              <span className={clsx('font-mono text-base font-bold tabular-nums', price.tone)}>{price.value}</span>
            </span>
            {lote.status === 'open' && (
              <span className="text-xs text-ink-faint">
                {offerCount === 0 ? 'Sin ofertas' : offerCount === 1 ? '1 oferta' : `${offerCount} ofertas`}
              </span>
            )}
          </span>
          <span className="mt-1.5 block">
            <MineTag sim={sim} lote={lote} />
          </span>
        </span>
      </button>
    </li>
  );
}

/**
 * Vista previa B de la Sala de un remate Timed: "vidriera". Arriba, el lote elegido en
 * grande: foto y descripción a la izquierda; a la derecha su nombre, el cronómetro, el
 * precio, el formulario y las ofertas recientes, todo junto. Debajo, a todo el ancho, el
 * catálogo de todos los lotes como mosaico de fotos, con filtros, buscador y orden (por
 * defecto, el que cierra primero). Tocar un lote del catálogo lo sube a la vitrina. Datos
 * simulados, sin backend: `?modo=normal|lider|garantia|anonimo`, `?largo=1`, `?lotes=N`,
 * `?vivo=0`.
 */
export function PreviewTimedBPage() {
  const sim = useTimedSim();
  const { remate, lotes } = sim;
  const now = useNow();
  const [selectedId, setSelectedId] = useState('lote-1');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('closing');
  const [guaranteeOpen, setGuaranteeOpen] = useState(false);

  const selected = lotes.find((l) => l.id === selectedId) ?? lotes[0];

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = lotes.filter((lote) => {
      if (
        q &&
        !lote.title.toLowerCase().includes(q) &&
        !lote.lot_number.includes(q) &&
        !CATEGORY_LABELS[lote.category].toLowerCase().includes(q)
      )
        return false;
      if (filter === 'open') return lote.status === 'open';
      if (filter === 'soon') return timeLeft(lote, now)?.soon === true;
      if (filter === 'mine') return sim.hasBid(lote.id);
      if (filter === 'closed') return lote.status === 'closed_sold' || lote.status === 'closed_unsold';
      return true;
    });
    const rank = (l: Lote) => (l.status === 'open' ? 0 : l.status === 'pending' ? 1 : 2);
    return [...filtered].sort((a, b) => {
      if (sort === 'number') return a.display_order - b.display_order;
      if (sort === 'price')
        return (sim.leadingAmounts[b.id] ?? Number(b.base_price)) - (sim.leadingAmounts[a.id] ?? Number(a.base_price));
      if (rank(a) !== rank(b)) return rank(a) - rank(b);
      const ea = a.timer_ends_at ? new Date(a.timer_ends_at).getTime() : Infinity;
      const eb = b.timer_ends_at ? new Date(b.timer_ends_at).getTime() : Infinity;
      return ea - eb;
    });
  }, [lotes, query, filter, sort, now, sim]);

  const openCount = lotes.filter((l) => l.status === 'open').length;
  const offers = sim.offersByLote[selected.id] ?? [];
  const select = (id: string) => {
    setSelectedId(id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-white font-display text-ink">
      <PreviewBuyerNav activeId="remates" staticBar />
      <GuaranteeStub open={guaranteeOpen} onClose={() => setGuaranteeOpen(false)} />

      <div className="mx-auto w-full max-w-[110rem] px-4 sm:px-6 lg:px-10">
        <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 pb-4 pt-4">
          <div className="flex min-w-0 items-center gap-4">
            <a
              href="#"
              onClick={(e) => e.preventDefault()}
              aria-label="Volver al remate"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line text-ink-muted transition hover:border-ink hover:text-ink focus-visible:outline-2 focus-visible:outline-brand-600"
            >
              <ArrowLeft aria-hidden="true" className="h-4 w-4" />
            </a>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-bold tracking-tight sm:text-xl">{remate.title}</h1>
              <p className="flex flex-wrap items-center gap-x-3 text-sm text-ink-muted">
                <span className="inline-flex items-center gap-1.5">
                  <LiveDot /> {openCount} lotes abiertos de {lotes.length}
                </span>
                {remate.ends_at && <span>Termina el {formatDateTime(remate.ends_at)}</span>}
              </p>
            </div>
          </div>
        </header>

        {/* Vitrina: el lote elegido */}
        <div className="grid grid-cols-1 gap-x-12 gap-y-8 border-t border-line pt-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(26rem,0.7fr)]">
          <main aria-label={`Lote ${selected.lot_number}`} className="min-w-0">
            <p className="text-sm text-ink-muted">
              Lote {selected.lot_number} · {CATEGORY_LABELS[selected.category]}
            </p>
            <h2 className="mb-4 mt-1 break-words text-2xl font-bold leading-tight tracking-tight sm:text-[32px]">
              {selected.title}
            </h2>
            <Gallery lote={selected} aspect="aspect-[16/11]" />
            <div className="mt-6 max-w-2xl">
              <h3 className="text-sm font-semibold">Sobre este lote</h3>
              <div className="mt-2">
                <Description text={selected.description ?? 'Este lote todavía no tiene una descripción cargada.'} />
              </div>
              <dl className="mt-5 flex flex-wrap gap-x-10 gap-y-3 text-sm">
                <div>
                  <dt className="text-ink-faint">Base</dt>
                  <dd className="font-mono font-semibold tabular-nums">{money(selected.base_price)}</dd>
                </div>
                <div>
                  <dt className="text-ink-faint">Incremento mínimo</dt>
                  <dd className="font-mono font-semibold tabular-nums">{money(selected.min_increment)}</dd>
                </div>
                {selected.status === 'open' && selected.timer_ends_at && (
                  <div>
                    <dt className="text-ink-faint">Cierra</dt>
                    <dd className="font-semibold">{formatDateTime(selected.timer_ends_at)}</dd>
                  </div>
                )}
              </dl>
            </div>
          </main>

          <section aria-label="Mesa de ofertas" className="min-w-0 xl:border-l xl:border-line xl:pl-10">
            <div className="flex flex-col gap-5 xl:sticky xl:top-4">
              <Clock lote={selected} extended={sim.extendedIds.has(selected.id)} />
              <BidPanel
                key={selected.id}
                sim={sim}
                lote={selected}
                onBuildGuarantee={() => setGuaranteeOpen(true)}
                priceSize="text-5xl"
              />
              <div className="border-t border-line pt-4">
                <RecentOffers offers={offers} loteKey={selected.id} incomingId={sim.lastIncomingId} />
              </div>
            </div>
          </section>
        </div>

        {/* Catálogo: todos los lotes */}
        <section aria-label="Todos los lotes" className="mt-14 border-t border-line pb-16 pt-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold tracking-tight">Todos los lotes</h2>
              <p className="mt-0.5 text-sm text-ink-muted">
                {visible.length === lotes.length
                  ? `${lotes.length} lotes en este remate`
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
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar lote"
                  aria-label="Buscar lote por número, título o rubro"
                  className="w-44 bg-transparent text-sm placeholder:text-ink-faint focus:outline-none"
                />
              </label>
              <label className="flex items-center gap-2 text-sm text-ink-muted">
                Ordenar
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as Sort)}
                  className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-sm text-ink focus-visible:outline-2 focus-visible:outline-brand-600"
                >
                  <option value="closing">Cierran antes</option>
                  <option value="number">Número de lote</option>
                  <option value="price">Mayor precio</option>
                </select>
              </label>
            </div>
          </div>

          <div role="group" aria-label="Filtrar lotes" className="mt-5 flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                aria-pressed={filter === f.id}
                className={clsx(
                  'rounded-full border px-3.5 py-1.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-brand-600',
                  filter === f.id
                    ? 'border-ink bg-ink font-semibold text-white'
                    : 'border-line text-ink-muted hover:border-ink hover:text-ink',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>

          {visible.length > 0 ? (
            <ul className="mt-6 grid grid-cols-1 gap-x-6 gap-y-9 min-[520px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {visible.map((lote) => (
                <LoteTile
                  key={lote.id}
                  sim={sim}
                  lote={lote}
                  index={lotes.indexOf(lote)}
                  active={lote.id === selected.id}
                  onSelect={() => select(lote.id)}
                />
              ))}
            </ul>
          ) : (
            <p className="mt-10 text-center text-sm text-ink-muted">
              {filter === 'mine' && !query ? 'Todavía no ofertaste en ningún lote.' : 'Ningún lote coincide con lo que buscás.'}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
