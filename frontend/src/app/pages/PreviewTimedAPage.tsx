import { useEffect, useMemo, useState } from 'react';
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

type Filter = 'all' | 'open' | 'soon' | 'mine';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'Todos' },
  { id: 'open', label: 'Abiertos' },
  { id: 'soon', label: 'Cierran pronto' },
  { id: 'mine', label: 'Mis ofertas' },
];

/** Una fila del índice: foto chica, número, título, precio y lo que falta para que cierre. */
function IndexRow({
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
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={active ? 'true' : undefined}
        className={clsx(
          'group relative flex w-full items-start gap-3 px-3 py-3 text-left transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-600',
          active ? 'bg-brand-50/70' : 'hover:bg-surface-subtle',
        )}
      >
        <span
          aria-hidden="true"
          className={clsx(
            'absolute inset-y-2 left-0 w-0.5 rounded-full transition-colors',
            active ? 'bg-brand-600' : 'bg-transparent',
          )}
        />
        <img
          src={lote.images[0]?.url}
          alt=""
          className={clsx('h-16 w-16 shrink-0 rounded-lg object-cover', closed && 'opacity-50 grayscale')}
          style={{ objectPosition: photoPosition(index) }}
        />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="text-xs text-ink-faint">Lote {lote.lot_number}</span>
            {lote.status === 'open' && <TimeChip lote={lote} />}
            {lote.status === 'pending' && <span className="text-xs font-medium text-brand-700">Abre pronto</span>}
            {closed && (
              <span className="text-xs font-medium text-ink-faint">
                {lote.status === 'closed_sold' ? 'Vendido' : 'Sin ofertas'}
              </span>
            )}
          </span>
          <span
            className={clsx(
              'mt-0.5 line-clamp-2 block text-sm font-semibold leading-snug',
              closed ? 'text-ink-muted' : 'text-ink',
            )}
          >
            {lote.title}
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className={clsx('font-mono text-sm font-semibold tabular-nums', price.tone)}>{price.value}</span>
            <MineTag sim={sim} lote={lote} />
          </span>
        </span>
      </button>
    </li>
  );
}

/**
 * Vista previa A de la Sala de un remate Timed: "índice lateral". Tres columnas: a la
 * izquierda todos los lotes como un índice con foto, precio y lo que falta para que cierren
 * (con buscador y filtros); en el medio el lote elegido, con su galería grande y toda su
 * información; a la derecha, fijo mientras se scrollea, el cronómetro, el precio, el
 * formulario de oferta y las ofertas recientes. Datos simulados, sin backend: las ofertas
 * se pueden hacer de verdad y cada tanto entra una de otro comprador.
 * `?modo=normal|lider|garantia|anonimo`, `?largo=1`, `?lotes=N`, `?vivo=0`.
 */
export function PreviewTimedAPage() {
  const sim = useTimedSim();
  const { remate, lotes } = sim;
  const now = useNow();
  const [selectedId, setSelectedId] = useState('lote-1');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [guaranteeOpen, setGuaranteeOpen] = useState(false);

  const selected = lotes.find((l) => l.id === selectedId) ?? lotes[0];
  const selectedIndex = lotes.findIndex((l) => l.id === selected.id);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return lotes.filter((lote) => {
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
      return true;
    });
  }, [lotes, query, filter, now, sim]);

  const openCount = lotes.filter((l) => l.status === 'open').length;
  const nextClose = useMemo(() => {
    const ends = lotes
      .filter((l) => l.status === 'open' && l.timer_ends_at)
      .map((l) => new Date(l.timer_ends_at as string).getTime());
    return ends.length ? Math.min(...ends) : null;
  }, [lotes]);
  const nextCloseLabel = nextClose
    ? (() => {
        const m = Math.max(0, Math.round((nextClose - now) / 60000));
        return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`;
      })()
    : null;

  // En pantallas angostas el lote elegido queda arriba: al tocar uno de la lista, se sube.
  useEffect(() => {
    if (window.innerWidth < 1280) window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [selectedId]);

  const offers = sim.offersByLote[selected.id] ?? [];

  return (
    <div className="min-h-screen bg-white font-display text-ink">
      <PreviewBuyerNav activeId="remates" staticBar />
      <GuaranteeStub open={guaranteeOpen} onClose={() => setGuaranteeOpen(false)} />

      <div className="mx-auto w-full max-w-[110rem] px-4 sm:px-6 lg:px-10">
        <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3 border-b border-line pb-5 pt-4">
          <div className="min-w-0 max-w-3xl">
            <a
              href="#"
              onClick={(e) => e.preventDefault()}
              className="inline-flex items-center gap-1.5 text-sm text-ink-muted transition hover:text-ink focus-visible:outline-2 focus-visible:outline-brand-600"
            >
              <ArrowLeft aria-hidden="true" className="h-4 w-4" />
              Volver al remate
            </a>
            <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-[28px]">{remate.title}</h1>
            <p className="mt-1 line-clamp-2 text-sm text-ink-muted">{remate.description}</p>
          </div>
          <dl className="flex gap-7 text-sm">
            <div>
              <dt className="flex items-center gap-1.5 text-ink-faint">
                <LiveDot /> Lotes abiertos
              </dt>
              <dd className="mt-0.5 font-mono text-xl font-bold tabular-nums">
                {openCount}
                <span className="text-sm font-normal text-ink-faint"> de {lotes.length}</span>
              </dd>
            </div>
            {nextCloseLabel && (
              <div>
                <dt className="text-ink-faint">Próximo cierre en</dt>
                <dd className="mt-0.5 font-mono text-xl font-bold tabular-nums">{nextCloseLabel}</dd>
              </div>
            )}
            {remate.ends_at && (
              <div className="hidden sm:block">
                <dt className="text-ink-faint">Termina</dt>
                <dd className="mt-0.5 text-base font-semibold">{formatDateTime(remate.ends_at)}</dd>
              </div>
            )}
          </dl>
        </header>

        <div className="grid grid-cols-1 gap-x-10 gap-y-8 py-6 xl:grid-cols-[21rem_minmax(0,1fr)_25rem]">
          {/* Índice de lotes */}
          <aside
            aria-label="Todos los lotes"
            className="order-3 xl:sticky xl:top-4 xl:order-1 xl:flex xl:max-h-[calc(100vh-2rem)] xl:flex-col xl:self-start"
          >
            <div className="flex items-baseline justify-between">
              <h2 className="text-base font-semibold">Lotes</h2>
              <span className="text-xs text-ink-faint">
                {visible.length === lotes.length ? `${lotes.length} en total` : `${visible.length} de ${lotes.length}`}
              </span>
            </div>
            <label className="mt-3 flex items-center gap-2 border-b border-line-strong pb-2 focus-within:border-ink">
              <Search aria-hidden="true" className="h-4 w-4 shrink-0 text-ink-faint" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por número, título o rubro"
                aria-label="Buscar lote por número, título o rubro"
                className="w-full bg-transparent text-sm placeholder:text-ink-faint focus:outline-none"
              />
            </label>
            <div role="group" aria-label="Filtrar lotes" className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-b border-line">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFilter(f.id)}
                  aria-pressed={filter === f.id}
                  className={clsx(
                    '-mb-px border-b-2 pb-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-brand-600',
                    filter === f.id
                      ? 'border-ink font-semibold text-ink'
                      : 'border-transparent text-ink-muted hover:text-ink',
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
            {visible.length > 0 ? (
              <ul className="-mx-3 mt-1 divide-y divide-line overflow-y-auto overscroll-contain xl:min-h-0 xl:flex-1">
                {visible.map((lote) => (
                  <IndexRow
                    key={lote.id}
                    sim={sim}
                    lote={lote}
                    index={lotes.indexOf(lote)}
                    active={lote.id === selected.id}
                    onSelect={() => setSelectedId(lote.id)}
                  />
                ))}
              </ul>
            ) : (
              <p className="mt-6 text-center text-sm text-ink-muted">
                {filter === 'mine' && !query ? 'Todavía no ofertaste en ningún lote.' : 'Ningún lote coincide con lo que buscás.'}
              </p>
            )}
          </aside>

          {/* El lote */}
          <main className="order-1 min-w-0 xl:order-2" aria-label={`Lote ${selected.lot_number}`}>
            <Gallery lote={selected} />
            <div className="mt-6">
              <p className="text-sm text-ink-muted">
                Lote {selected.lot_number} · {CATEGORY_LABELS[selected.category]}
              </p>
              <h2 className="mt-1 break-words text-2xl font-bold leading-tight tracking-tight sm:text-3xl">
                {selected.title}
              </h2>
              <dl className="mt-5 grid grid-cols-3 divide-x divide-line border-y border-line text-sm">
                <div className="py-3 pr-4">
                  <dt className="text-ink-faint">Base</dt>
                  <dd className="mt-0.5 font-mono font-semibold tabular-nums">{money(selected.base_price)}</dd>
                </div>
                <div className="px-4 py-3">
                  <dt className="text-ink-faint">Incremento mínimo</dt>
                  <dd className="mt-0.5 font-mono font-semibold tabular-nums">{money(selected.min_increment)}</dd>
                </div>
                <div className="py-3 pl-4">
                  <dt className="text-ink-faint">{selected.status === 'open' ? 'Cierra' : 'Estado'}</dt>
                  <dd className="mt-0.5 font-semibold">
                    {selected.status === 'open' && selected.timer_ends_at
                      ? formatDateTime(selected.timer_ends_at)
                      : selected.status === 'pending'
                        ? 'Todavía no abrió'
                        : selected.status === 'closed_sold'
                          ? 'Vendido'
                          : 'Cerró sin ofertas'}
                  </dd>
                </div>
              </dl>
              <div className="mt-5 max-w-2xl">
                <Description text={selected.description ?? 'Este lote todavía no tiene una descripción cargada.'} />
              </div>
            </div>
            <p className="mt-6 text-xs text-ink-faint">
              Lote {selectedIndex + 1} de {lotes.length} · elegí otro en la lista para compararlos sin salir de la sala.
            </p>
          </main>

          {/* Mesa de ofertas */}
          <section
            aria-label="Mesa de ofertas"
            className="order-2 xl:sticky xl:top-4 xl:order-3 xl:max-h-[calc(100vh-2rem)] xl:self-start xl:overflow-y-auto xl:border-l xl:border-line xl:pl-8"
          >
            <div className="flex flex-col gap-5">
              <Clock lote={selected} extended={sim.extendedIds.has(selected.id)} />
              <BidPanel key={selected.id} sim={sim} lote={selected} onBuildGuarantee={() => setGuaranteeOpen(true)} />
              <div className="border-t border-line pt-4">
                <RecentOffers offers={offers} loteKey={selected.id} incomingId={sim.lastIncomingId} />
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
