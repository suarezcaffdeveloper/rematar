import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useReducedMotion } from 'framer-motion';
import { History, Plus, Search } from 'lucide-react';
import { useAuth } from '../../auth/hooks';
import { Alert } from '../../../shared/components/Alert';
import { Button } from '../../../shared/components/Button';
import { Pagination } from '../../../shared/components/Pagination';
import { usePagedList } from '../../../shared/hooks/usePagedList';
import { useBreadcrumb } from '../../../app/layouts/useBreadcrumb';
import { useTopNavLayout } from '../../../app/layouts/useTopNavLayout';
import { useFinishedRemates } from '../../history/hooks';
import { useVentasAdjudicadas } from '../../postauction/hooks';
import { DEFAULT_FILTERS, filterAndSortRemates } from '../../remates/filtering';
import { useRemates } from '../../remates/hooks';
import { RemateCreatedOverlay } from '../components/RemateCreatedOverlay';
import { RemateStartedOverlay } from '../components/RemateStartedOverlay';
import { RemateWizard } from '../components/RemateWizard';
import { RematadorRemateCard } from '../components/RematadorRemateCard';
import { RematadorRemateCardSkeleton } from '../components/RematadorRemateCardSkeleton';
import { EmpresaLiveGallery, MAX_EMPRESA_GALLERY_PANELS } from '../components/dashboard/EmpresaLiveGallery';
import { MonthlyNumbers } from '../components/dashboard/MonthlyNumbers';
import { PendingTasks } from '../components/dashboard/PendingTasks';
import {
  DASHBOARD_STATUS_FILTERS,
  buildHeadline,
  buildPendingTasks,
  computeMonthlyResults,
  formatCompactMoney,
  matchesStatusFilter,
  sortForDashboard,
  type DashboardStatusFilter,
} from '../dashboard';
import type { Remate } from '../../remates/types';

const SKELETON_COUNT = 6;
// La grilla suma una tarjeta fija "Crear remate" al principio de la primera página, así
// que 11 remates + esa tarjeta llenan 4 filas de 3 columnas.
const PAGE_SIZE = 11;
const HIGHLIGHT_MS = 2000;
const CARD_GRID_CLASSES = 'grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4';
const SALES_PAGE_SIZE = 100;
const FINISHED_PAGE_SIZE = 100;

interface DashboardLocationState {
  /** Seteado por `LotesManagementPage` al publicar un remate -- ver el `useEffect` más
   * abajo. Mismo patrón que `RequireAuth`/`LoginPage` (`location.state.from`), pero para
   * un resalte visual en vez de una redirección post-login. */
  highlightRemateId?: string;
}

function formatToday(): string {
  const text = new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
  // Solo la primera letra en mayúscula: `capitalize` de CSS pondría "De" en cada palabra.
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Panel principal de la empresa -- "Mis remates" (Épica 5, Módulo 5.1; rediseño editorial
 * sobre el mismo sistema visual que el inicio del comprador: `BuyerTopNav`, tipografía
 * `font-display`, líneas `ink`/`line`, galería en acordeón). Está pensado para que la empresa
 * entienda de un vistazo qué tiene que hacer, no solo para listar lo que tiene:
 *
 * 1. Titular + "Crear remate".
 * 2. "Qué hacer ahora" (`PendingTasks`) -- lo urgente primero; se deriva de los remates
 *    propios y de las ventas sin cobrar (`buildPendingTasks`).
 * 3. "En curso" (`EmpresaLiveGallery`) -- los remates corriendo ahora, con su precio vivo o
 *    cuenta regresiva.
 * 4. "Tus últimos 30 días" (`MonthlyNumbers`) -- del historial de finalizados. Solo aparece
 *    si hubo remates cerrados en el período.
 * 5. "Tus remates" -- todos, con filtro por etapa y búsqueda. Cada tarjeta dice en qué etapa
 *    está y qué sigue (ver `RematadorRemateCard`).
 *
 * `useTopNavLayout()` pide a `AppLayout` que reemplace `Sidebar` + `Header` por la misma barra
 * superior del comprador; la página arma su propio contenedor. Reusa `useRemates`/
 * `filterAndSortRemates` (todo el filtrado es del lado del cliente, ver `filtering.ts`).
 * "Ventas adjudicadas"/"Historial" siguen en el menú superior (`navItems.ts`).
 */
export function RematadorDashboardPage() {
  useTopNavLayout();
  useBreadcrumb([{ label: 'Inicio', to: '/' }, { label: 'Mis remates' }]);
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const reduceMotion = useReducedMotion();
  const { remates, isLoading, error, reload } = useRemates({ ownerId: user?.id ?? '' });
  const { data: finishedPage } = useFinishedRemates({}, 1, FINISHED_PAGE_SIZE);
  const { data: pendingSalesPage } = useVentasAdjudicadas({ status: 'pago_pendiente' }, 1, SALES_PAGE_SIZE);
  const [statusFilter, setStatusFilter] = useState<DashboardStatusFilter>('all');
  const [search, setSearch] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createdRemate, setCreatedRemate] = useState<Remate | null>(null);
  const [startedRemate, setStartedRemate] = useState<Remate | null>(null);
  const [highlightedRemateId, setHighlightedRemateId] = useState<string | null>(null);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    const state = location.state as DashboardLocationState | null;
    if (!state?.highlightRemateId) return;
    setHighlightedRemateId(state.highlightRemateId);
    // Se consume una sola vez -- sin esto, volver con el botón "atrás" o refrescar la
    // página repetiría el resalte cada vez (mismo motivo por el que `LoginPage` limpia
    // `location.state.from` después de usarlo).
    navigate(location.pathname, { replace: true, state: null });
    const timer = setTimeout(() => setHighlightedRemateId(null), HIGHLIGHT_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasAnyRemates = remates.length > 0;
  const showContent = !isLoading && !error;

  const pendingSales = useMemo(() => {
    const items = pendingSalesPage?.items ?? [];
    if (items.length === 0) return null;
    const currency = remates[0]?.settings.currency ?? 'ARS';
    const amount = items.reduce((acc, item) => acc + (Number(item.final_price) || 0), 0);
    return { count: pendingSalesPage?.total ?? items.length, amountLabel: formatCompactMoney(amount, currency) };
  }, [pendingSalesPage, remates]);

  const tasks = useMemo(() => buildPendingTasks(remates, now, pendingSales), [remates, now, pendingSales]);
  const runningRemates = useMemo(
    () => remates.filter((remate) => remate.status === 'live' || remate.status === 'paused'),
    [remates],
  );
  const monthlyResults = useMemo(() => {
    const currencyById = new Map(remates.map((remate) => [remate.id, remate.settings.currency]));
    return computeMonthlyResults(finishedPage?.items ?? [], currencyById, now);
  }, [finishedPage, remates, now]);

  const visibleRemates = useMemo(() => {
    const searched = filterAndSortRemates(remates, { ...DEFAULT_FILTERS, search });
    return sortForDashboard(searched.filter((remate) => matchesStatusFilter(remate.status, statusFilter)));
  }, [remates, search, statusFilter]);
  const { page, totalPages, pageItems, goToPage, resetPage } = usePagedList(visibleRemates, PAGE_SIZE);

  function handlePageChange(next: number) {
    goToPage(next);
    // Sin esto, cambiar de página deja el scroll donde estaba -- a la altura de la
    // paginación, al pie de la grilla anterior -- así que la página nueva arranca
    // invisible hasta que el usuario suba a mano.
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
  }

  return (
    <div className="min-h-screen bg-white font-display text-ink">
      <div className="mx-auto w-full max-w-[110rem] px-3 py-8 sm:px-6 lg:px-10">
        <header className="flex flex-col gap-6">
          <p className="text-ink-muted">
            <span>{formatToday()}</span>
            {user?.full_name ? ` · ${user.full_name}` : ''}
          </p>
          <h1 className="max-w-[20ch] text-balance text-4xl font-semibold leading-[1.02] tracking-tight sm:text-6xl">
            {isLoading ? 'Mis remates' : buildHeadline(remates, tasks.length)}
          </h1>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setIsCreateOpen(true)}
              className="group inline-flex items-center gap-2 rounded-full bg-ink px-7 py-3.5 text-[15px] font-semibold text-white transition-colors hover:bg-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
            >
              <Plus aria-hidden="true" className="h-[18px] w-[18px] transition-transform duration-200 group-hover:rotate-90" />
              Crear remate
            </button>
            <Link
              to="/historial"
              className="inline-flex items-center gap-2 rounded-full border border-line-strong bg-white px-7 py-3.5 text-[15px] font-semibold transition-colors hover:border-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
            >
              <History aria-hidden="true" className="h-[18px] w-[18px]" />
              Ver historial
            </Link>
          </div>
        </header>

        {error && (
          <div className="mt-10">
            <Alert variant="error">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span>{error.message}</span>
                <Button variant="secondary" onClick={reload}>
                  Reintentar
                </Button>
              </div>
            </Alert>
          </div>
        )}

        {showContent && hasAnyRemates && (
          <section aria-labelledby="todo-title" className="mt-12">
            <SectionHeading id="todo-title" title="Qué hacer ahora" description="Lo que necesita tu atención, ordenado por urgencia." />
            <PendingTasks tasks={tasks} />
          </section>
        )}

        {showContent && runningRemates.length > 0 && (
          <section aria-labelledby="running-title" className="mt-20">
            <SectionHeading
              id="running-title"
              title="En curso"
              description="Seguí cada remate en tiempo real. Pasá el cursor o tocá un panel para ver su detalle."
            />
            <EmpresaLiveGallery remates={runningRemates} />
            {runningRemates.length > MAX_EMPRESA_GALLERY_PANELS && (
              <p className="mt-3 text-sm text-ink-muted">
                Mostrando {MAX_EMPRESA_GALLERY_PANELS} de {runningRemates.length} remates en curso. Los demás están en
                “Tus remates”.
              </p>
            )}
          </section>
        )}

        {showContent && monthlyResults && (
          <section aria-labelledby="numbers-title" className="mt-20">
            <SectionHeading id="numbers-title" title="Tus últimos 30 días" description="Cómo viene el negocio en los remates que ya cerraron." />
            <MonthlyNumbers
              results={monthlyResults}
              pendingSalesLabel={pendingSales ? `${pendingSales.count} · ${pendingSales.amountLabel}` : null}
            />
          </section>
        )}

        <section aria-labelledby="remates-title" className="mt-20">
          <SectionHeading id="remates-title" title="Tus remates" description="Cada remate muestra en qué etapa está y qué sigue." />

          {isLoading && !error && (
            <div className={CARD_GRID_CLASSES}>
              {Array.from({ length: SKELETON_COUNT }, (_, index) => (
                <RematadorRemateCardSkeleton key={index} />
              ))}
            </div>
          )}

          {showContent && !hasAnyRemates && (
            <div className="grid justify-items-center gap-3 rounded-3xl border border-dashed border-line-strong px-6 py-16 text-center">
              <h3 className="text-2xl font-semibold tracking-tight">Todavía no creaste ningún remate</h3>
              <p className="max-w-[46ch] text-ink-muted">
                Armá el primero en cinco pasos. Se guarda como borrador y nadie lo ve hasta que lo publiques.
              </p>
              <Button variant="hero" onClick={() => setIsCreateOpen(true)} className="mt-2 px-6 py-3">
                <Plus aria-hidden="true" className="h-4 w-4" />
                Crear mi primer remate
              </Button>
            </div>
          )}

          {showContent && hasAnyRemates && (
            <>
              <div className="mb-8 flex flex-wrap items-center gap-x-4 gap-y-3">
                <div role="group" aria-label="Filtrar por etapa" className="flex flex-wrap gap-1.5">
                  {DASHBOARD_STATUS_FILTERS.map((option) => {
                    const count = remates.filter((remate) => matchesStatusFilter(remate.status, option.value)).length;
                    const isActive = statusFilter === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        aria-pressed={isActive}
                        onClick={() => {
                          setStatusFilter(option.value);
                          resetPage();
                        }}
                        className={`rounded-full border px-4 py-2 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                          isActive
                            ? 'border-ink bg-ink text-white'
                            : 'border-line bg-white text-ink-muted hover:border-ink hover:text-ink'
                        }`}
                      >
                        {option.label}
                        <span className="ml-1.5 font-medium tabular-nums opacity-65">{count}</span>
                      </button>
                    );
                  })}
                </div>
                <label className="relative ml-auto w-full sm:w-56">
                  <span className="sr-only">Buscar remate</span>
                  <Search aria-hidden="true" className="pointer-events-none absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
                  <input
                    type="search"
                    value={search}
                    onChange={(event) => {
                      setSearch(event.target.value);
                      resetPage();
                    }}
                    placeholder="Buscar remate"
                    className="w-full border-0 border-b border-line-strong bg-transparent py-2 pl-6 pr-1 text-sm text-ink placeholder:text-ink-faint focus:border-ink focus:outline-none"
                  />
                </label>
              </div>

              <div className={CARD_GRID_CLASSES}>
                {page === 1 && statusFilter === 'all' && search.trim() === '' && (
                  <button
                    type="button"
                    onClick={() => setIsCreateOpen(true)}
                    className="group flex min-h-[20rem] flex-col items-center justify-center gap-3 rounded-2xl border-[1.5px] border-dashed border-line-strong bg-white p-6 text-center transition-colors hover:border-brand-600 hover:bg-brand-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                  >
                    <span className="flex h-14 w-14 items-center justify-center rounded-full bg-ink text-white">
                      <Plus aria-hidden="true" className="h-6 w-6 transition-transform duration-200 group-hover:rotate-90" />
                    </span>
                    <span className="text-xl font-semibold tracking-tight">Crear remate</span>
                    <span className="max-w-[26ch] text-sm text-ink-muted">Te guiamos en cinco pasos. Se guarda como borrador.</span>
                  </button>
                )}
                {pageItems.map((remate) => (
                  <RematadorRemateCard
                    key={remate.id}
                    remate={remate}
                    onChanged={reload}
                    onStarted={setStartedRemate}
                    isHighlighted={remate.id === highlightedRemateId}
                  />
                ))}
              </div>

              {visibleRemates.length === 0 && (
                <div className="mt-2 grid justify-items-start gap-3">
                  <p className="text-lg font-semibold">Ningún remate coincide con tu búsqueda</p>
                  <p className="text-ink-muted">Probá con otro título, o cambiá de etapa.</p>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setSearch('');
                      setStatusFilter('all');
                      resetPage();
                    }}
                  >
                    Limpiar filtros
                  </Button>
                </div>
              )}

              {visibleRemates.length > 0 && <Pagination page={page} totalPages={totalPages} onPageChange={handlePageChange} />}
            </>
          )}
        </section>
      </div>

      <RemateWizard
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onCreated={(created) => {
          reload();
          setCreatedRemate(created);
        }}
      />

      <RemateCreatedOverlay
        isOpen={createdRemate !== null}
        onDone={() => {
          if (createdRemate) navigate(`/remates/${createdRemate.id}/lotes`);
        }}
      />

      {/* Vive acá, no dentro de `RematadorRemateCard` (donde estaba antes): iniciar el
          remate llama a `reload()`, que mientras la lista recarga reemplaza brevemente
          las tarjetas por esqueletos -- si el cartel/timer vivía dentro de la tarjeta, se
          desmontaba con ella y la redirección nunca llegaba a dispararse. Acá, al nivel
          de la página, sobrevive a ese vaivén. */}
      <RemateStartedOverlay
        isOpen={startedRemate !== null}
        onDone={() => {
          const target = startedRemate;
          setStartedRemate(null);
          if (target) navigate(`/remates/${target.id}/gestionar`);
        }}
      />
    </div>
  );
}

function SectionHeading({ id, title, description }: { id: string; title: string; description: string }) {
  return (
    <div className="mb-6">
      <h2 id={id} className="text-2xl font-semibold tracking-tight sm:text-3xl">
        {title}
      </h2>
      <p className="mt-1.5 max-w-[60ch] text-ink-muted">{description}</p>
    </div>
  );
}
