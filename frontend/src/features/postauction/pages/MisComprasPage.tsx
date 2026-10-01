import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { useBreadcrumb } from '../../../app/layouts/useBreadcrumb';
import { useTopNavLayout } from '../../../app/layouts/useTopNavLayout';
import { Alert } from '../../../shared/components/Alert';
import { Button } from '../../../shared/components/Button';
import { EmptyState } from '../../../shared/components/EmptyState';
import { Skeleton } from '../../../shared/components/Skeleton';
import { GavelIcon } from '../../remates/components/icons';
import { ComprasHero, ComprasNovedades } from '../components/compras/ComprasHero';
import { ComprasInProgress } from '../components/compras/ComprasInProgress';
import { ComprasReceived } from '../components/compras/ComprasReceived';
import {
  COMPRAS_GROUPS,
  groupOf,
  isInProgress,
  matchesComprasSearch,
  pickFocus,
  recentEvents,
  sortInProgress,
  type ComprasGroupId,
} from '../comprasUtils';
import { useAllMisCompras } from '../hooks';

const NOVEDADES_COUNT = 4;

/**
 * "Mis compras" del comprador (Épica 7, Módulo 7.5), en `/mis-compras` -- lotes ganados,
 * estado actual, fecha de adjudicación, precio final e información del rematador (pedido
 * explícito del enunciado). El backend (`PostAuctionService.list_for_buyer`) ya
 * restringe a las compras propias.
 *
 * Rediseño (mismo lenguaje visual que el inicio del comprador): carga todas las compras
 * una sola vez (`useAllMisCompras`) y arma todo sobre esa lista -- la compra que más te
 * necesita en grande, con sus últimas novedades al costado; después las que siguen en
 * proceso (con el recorrido de 8 pasos de cada una) y las ya recibidas. El filtro por
 * etapa y la búsqueda son client-side, como en el inicio. `useTopNavLayout()` le pide a
 * `AppLayout` la barra superior `BuyerTopNav` en lugar de `Sidebar` + `Header`.
 */
export function MisComprasPage() {
  useTopNavLayout();
  useBreadcrumb([{ label: 'Inicio', to: '/' }, { label: 'Mis compras' }]);
  const { data: compras, isLoading, error, reload } = useAllMisCompras();
  const [group, setGroup] = useState<ComprasGroupId | 'all'>('all');
  const [search, setSearch] = useState('');

  const focus = useMemo(() => pickFocus(compras), [compras]);
  const events = useMemo(() => recentEvents(compras, NOVEDADES_COUNT), [compras]);

  const filtered = useMemo(
    () =>
      compras.filter(
        (compra) => (group === 'all' || groupOf(compra.status) === group) && matchesComprasSearch(compra, search),
      ),
    [compras, group, search],
  );
  const inProgress = useMemo(() => sortInProgress(filtered), [filtered]);
  const received = useMemo(
    () =>
      filtered
        .filter((compra) => !isInProgress(compra))
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [filtered],
  );

  const hasCompras = compras.length > 0;
  const isReady = !isLoading && !error;

  function clearFilters() {
    setGroup('all');
    setSearch('');
  }

  return (
    <div className="min-h-screen bg-white font-display text-ink">
      <div className="mx-auto w-full max-w-[110rem] px-3 py-8 sm:px-6 lg:px-10">
        <header className="mb-8 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <h1 className="text-balance text-4xl font-semibold leading-[1.02] tracking-tight sm:text-6xl">
            Mis compras
          </h1>
          <p className="max-w-sm text-ink-muted">
            {isReady && !hasCompras
              ? 'Cuando ganes un lote, lo seguís desde acá.'
              : 'Seguí cada lote que ganaste, desde la adjudicación hasta que lo tenés en tus manos.'}
          </p>
        </header>

        {error && (
          <Alert variant="error">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>No se pudieron cargar tus compras.</span>
              <Button variant="secondary" onClick={reload}>
                Reintentar
              </Button>
            </div>
          </Alert>
        )}

        {isLoading && !error && (
          <div className="flex flex-col gap-10">
            <Skeleton className="h-[26rem] w-full rounded-2xl" />
            <Skeleton className="h-44 w-full rounded-xl" />
            <Skeleton className="h-44 w-full rounded-xl" />
          </div>
        )}

        {isReady && !hasCompras && (
          <EmptyState
            icon={<GavelIcon className="h-10 w-10" />}
            title="Todavía no ganaste ningún lote"
            description="Cuando te adjudiquen un lote, vas a poder seguir acá el proceso de pago y entrega."
          />
        )}

        {isReady && hasCompras && (
          <>
            {focus ? (
              <ComprasHero focus={focus} events={events} />
            ) : (
              events.length > 0 && (
                <div className="max-w-xl">
                  <ComprasNovedades events={events} />
                </div>
              )
            )}

            <div className="mt-12 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por etapa">
                <GroupChip selected={group === 'all'} onClick={() => setGroup('all')}>
                  Todas <span className="tabular-nums opacity-60">{compras.length}</span>
                </GroupChip>
                {COMPRAS_GROUPS.map((g) => (
                  <GroupChip key={g.id} selected={group === g.id} onClick={() => setGroup(g.id)}>
                    {g.label}{' '}
                    <span className="tabular-nums opacity-60">
                      {compras.filter((compra) => groupOf(compra.status) === g.id).length}
                    </span>
                  </GroupChip>
                ))}
              </div>
              <label className="relative block w-full lg:w-80">
                <span className="sr-only">Buscar en mis compras</span>
                <Search
                  className="pointer-events-none absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar por lote o remate"
                  aria-label="Buscar en mis compras"
                  className="w-full border-b border-line-strong bg-transparent py-2 pl-7 pr-2 text-base outline-none transition-colors placeholder:text-ink-faint focus:border-ink"
                />
              </label>
            </div>

            {filtered.length === 0 && (
              <div className="mt-8">
                <EmptyState
                  icon={<GavelIcon className="h-10 w-10" />}
                  title="Ninguna compra coincide con tu búsqueda"
                  description="Probá con otra etapa o con otro texto."
                  action={
                    <Button variant="secondary" onClick={clearFilters}>
                      Limpiar filtros
                    </Button>
                  }
                />
              </div>
            )}

            {inProgress.length > 0 && <ComprasInProgress compras={inProgress} />}
            {received.length > 0 && <ComprasReceived compras={received} />}
          </>
        )}
      </div>
    </div>
  );
}

function GroupChip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 ${
        selected ? 'border-ink bg-ink text-white' : 'border-line bg-white text-ink hover:border-ink-faint'
      }`}
    >
      {children}
    </button>
  );
}
