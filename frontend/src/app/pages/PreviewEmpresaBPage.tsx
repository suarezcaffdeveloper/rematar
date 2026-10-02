import type { ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import { ArrowLeft, ExternalLink, MessageCircleQuestion } from 'lucide-react';
import { MOCK_REMATE } from './previewConsola/mockData';
import { clock } from './previewConsola/shared';
import {
  LoteStrip,
  PriceLadder,
  PulseChart,
  RevenueChart,
  SegBar,
  Sparkline,
  duration,
  hhmm,
  peso,
  pesoCorto,
} from './previewEmpresa/charts';
import {
  ActiveFacts,
  AccessGrid,
  AlertList,
  DesiertosList,
  EmpresaSwitch,
  EventFeed,
  LeaderPrice,
  OperatorChip,
  QuietMeter,
  ResultsTable,
  SectionHead,
  StatusPill,
  UpcomingList,
  overBase,
} from './previewEmpresa/parts';
import { ChatRail } from './previewEmpresa/qa';
import { useEmpresaSim, type EmpresaSim } from './previewEmpresa/sim';

type TabId = 'resumen' | 'analisis' | 'lotes' | 'equipo';

/**
 * Vista previa B del panel de la empresa en un remate en vivo: "Cabina". Separa lo que hay
 * que mirar siempre de lo que se consulta cuando hace falta:
 *
 * - Siempre visible, pegada arriba aunque se scrollee: una barra con el estado del remate,
 *   el martillero, el lote y su precio, lo recaudado, los compradores y los avisos.
 * - Debajo, el lote en remate como pieza central (oscura, como la galería de "Mis remates"),
 *   con la escalera de precio adentro.
 * - Y cuatro pestañas: Resumen (lo que pasa ahora, ofertas y chat), Análisis (todos los
 *   gráficos e indicadores), Lotes (cola, desiertos y resultados) y Equipo y accesos
 *   (martillero, transmisión, ingreso de compradores).
 * Simulación sin backend: `?tab=`, `?martillero=0`, `?estado=pausado`, `?stream=0`.
 */
export function PreviewEmpresaBPage() {
  const sim = useEmpresaSim();
  const [params, setParams] = useSearchParams();
  const tab = (['resumen', 'analisis', 'lotes', 'equipo'].includes(params.get('tab') ?? '') ? params.get('tab') : 'resumen') as TabId;
  const setTab = (id: TabId) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('tab', id);
      return next;
    }, { replace: true });

  const equipoAttention = !sim.operatorOnline || !sim.streamOn;

  return (
    <div className="min-h-screen bg-white font-display text-ink">
      <StickyBar sim={sim} />

      <div className="mx-auto w-full max-w-[110rem] px-3 pb-28 pt-5 sm:px-6 lg:px-10">
        <div className="grid gap-x-10 gap-y-10 xl:grid-cols-[minmax(0,1fr)_24rem]">
          <main className="min-w-0">
            <Hero sim={sim} />

            <div role="tablist" aria-label="Secciones del panel" className="mt-8 flex gap-7 overflow-x-auto border-b border-line">
              {(
                [
                  ['resumen', 'Resumen', null],
                  ['analisis', 'Análisis', null],
                  ['lotes', 'Lotes', sim.desiertos.length > 0 ? sim.desiertos.length : null],
                  ['equipo', 'Equipo y accesos', equipoAttention ? '!' : null],
                ] as [TabId, string, number | string | null][]
              ).map(([id, label, badge]) => (
                <button
                  key={id}
                  role="tab"
                  type="button"
                  aria-selected={tab === id}
                  aria-controls={`pe-panel-${id}`}
                  onClick={() => setTab(id)}
                  className={clsx(
                    '-mb-px flex shrink-0 items-center gap-2 border-b-2 pb-3 pt-1 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
                    tab === id ? 'border-ink text-ink' : 'border-transparent text-ink-muted hover:text-ink',
                  )}
                >
                  {label}
                  {badge !== null && (
                    <span className="rounded-full bg-warning-100 px-1.5 text-xs font-semibold tabular-nums text-warning-800">{badge}</span>
                  )}
                </button>
              ))}
            </div>

            <div id={`pe-panel-${tab}`} role="tabpanel" className="pt-8">
              {tab === 'resumen' && <Resumen sim={sim} />}
              {tab === 'analisis' && <Analisis sim={sim} />}
              {tab === 'lotes' && <Lotes sim={sim} />}
              {tab === 'equipo' && <AccessGrid sim={sim} />}
            </div>
          </main>

          <aside aria-label="Ofertas, preguntas y chat" className="min-w-0 xl:border-l xl:border-line xl:pl-8">
            <div className="xl:sticky xl:top-[4.75rem] xl:flex xl:h-[calc(100vh-6rem)] xl:flex-col">
              <ChatRail sim={sim} />
            </div>
          </aside>
        </div>
      </div>

      <EmpresaSwitch current="b" onReset={() => window.location.reload()} />
    </div>
  );
}

/* ------------------------------------------------------------------ barra fija */

function Stat({ label, value, className = '' }: { label: string; value: ReactNode; className?: string }) {
  return (
    <div className={clsx('flex min-w-0 flex-col', className)}>
      <span className="text-[11px] leading-none text-white/50">{label}</span>
      <span className="mt-1 truncate text-sm font-semibold leading-none tabular-nums text-white">{value}</span>
    </div>
  );
}

function StickyBar({ sim }: { sim: EmpresaSim }) {
  const urgent = sim.alerts.filter((a) => a.level !== 'info');
  return (
    <header className="sticky top-0 z-40 bg-ink text-white shadow-[0_1px_0_rgba(255,255,255,0.08)]">
      <div className="mx-auto flex w-full max-w-[110rem] items-center gap-x-6 px-3 py-3 sm:px-6 lg:px-10">
        <Link
          to="/"
          aria-label="Volver a Mis remates"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/20 text-white/75 transition-colors hover:border-white hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </Link>
        <div className="flex min-w-0 flex-1 items-center gap-x-6 overflow-hidden">
          <div className="min-w-0 shrink basis-56">
            <p className="truncate text-sm font-semibold tracking-tight">{MOCK_REMATE.title}</p>
            <p className="mt-0.5 flex items-center gap-3 text-xs text-white/60">
              <StatusPill sim={sim} onDark />
              <span className="tabular-nums">{clock(sim.elapsedSeconds)}</span>
            </p>
          </div>
          <span aria-hidden="true" className="hidden h-8 w-px shrink-0 bg-white/15 md:block" />
          <Stat className="hidden md:flex" label={sim.active ? `Lote ${sim.active.number} · líder` : 'Lote en remate'} value={sim.winning ? peso(sim.winning.amount) : '—'} />
          <Stat className="hidden lg:flex" label="Recaudado" value={pesoCorto(sim.revenue)} />
          <Stat className="hidden sm:flex" label="Compradores" value={sim.connected} />
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <div className="hidden sm:block">
            <OperatorChip sim={sim} onDark />
          </div>
          {sim.pendingQuestions.length > 0 && (
            <a
              href="#pe-rail"
              className="inline-flex items-center gap-1.5 rounded-full bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <MessageCircleQuestion className="h-3.5 w-3.5" aria-hidden="true" />
              {sim.pendingQuestions.length} {sim.pendingQuestions.length === 1 ? 'pregunta' : 'preguntas'}
            </a>
          )}
          {urgent.length > 0 && (
            <span className="hidden items-center gap-1.5 rounded-full bg-warning-400 px-3 py-1.5 text-xs font-semibold text-ink md:inline-flex">
              {urgent.length} {urgent.length === 1 ? 'aviso' : 'avisos'}
            </span>
          )}
          <a
            href={`/remates/${MOCK_REMATE.remateId}/sala`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-white/25 px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:border-white hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">Ver como comprador</span>
            <span className="sr-only">Ver como comprador (se abre en otra pestaña)</span>
          </a>
        </div>
      </div>
    </header>
  );
}

/* ----------------------------------------------------------------------- hero */

function Hero({ sim }: { sim: EmpresaSim }) {
  const lote = sim.active;
  if (!lote) {
    const next = sim.upcoming[0];
    return (
      <section aria-label="Lote en remate" className="rounded-3xl bg-ink p-8 text-white sm:p-10">
        <p className="text-sm text-white/60">Entre lotes</p>
        <p className="mt-2 text-3xl font-semibold tracking-tight">{next ? `Sigue el lote ${next.number}` : 'No quedan lotes por abrir'}</p>
        {next && <p className="mt-2 max-w-xl text-white/65">{next.title}</p>}
      </section>
    );
  }
  const lead = sim.winning?.amount ?? null;
  return (
    <section aria-label="Lote en remate" className="overflow-hidden rounded-3xl bg-ink text-white">
      <div className="grid lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
        <div className="relative min-h-[16rem] lg:min-h-full">
          <img src={lote.images[0]} alt={lote.title} className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-ink/80 via-transparent to-transparent lg:bg-gradient-to-r lg:from-transparent lg:via-transparent lg:to-ink" />
          <span className="absolute left-5 top-5 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-ink backdrop-blur">
            Lote {lote.number} en remate
          </span>
        </div>

        <div className="flex min-w-0 flex-col gap-6 p-6 sm:p-8 lg:pl-4">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] xl:items-end">
            <div className="min-w-0">
              <p className="line-clamp-2 text-balance text-lg font-medium text-white/80">{lote.title}</p>
              <p className="mt-4 text-xs text-white/55">Oferta líder</p>
              <p className="text-5xl font-semibold tracking-tight sm:text-6xl">
                <LeaderPrice amount={lead} />
              </p>
              <p className="mt-1 text-sm text-white/65 tabular-nums">{lead ? overBase(lead, lote.basePrice) : 'Sin ofertas todavía'}</p>
            </div>
            <QuietMeter seconds={sim.secondsSinceLastOffer} tone="dark" />
          </div>

          <ActiveFacts sim={sim} tone="dark" />

          <div className="border-t border-white/10 pt-4">
            <p className="mb-1 text-sm font-semibold text-white">Cómo escaló el precio</p>
            <PriceLadder offers={sim.offers} base={lote.basePrice} now={sim.now} tone="dark" height={156} />
          </div>
        </div>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------------- pestañas */

function Kpi({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="min-w-0 px-5 py-4 first:pl-0">
      <p className="text-xs text-ink-muted">{label}</p>
      <p className="mt-1 truncate text-2xl font-semibold tracking-tight tabular-nums text-ink">{value}</p>
      {hint && <p className="mt-0.5 truncate text-xs text-ink-faint">{hint}</p>}
    </div>
  );
}

function Resumen({ sim }: { sim: EmpresaSim }) {
  const closed = sim.sold.length + sim.unsold.length;
  return (
    <div className="flex min-w-0 flex-col gap-10">
      <dl className="grid grid-cols-2 divide-x divide-line border-b border-line pb-2 lg:grid-cols-4">
        <Kpi label="Recaudado" value={pesoCorto(sim.revenue)} hint={`+${sim.upliftPct.toFixed(0)} % sobre el precio base`} />
        <Kpi label="Lotes cerrados" value={`${closed}/${sim.totalLotes}`} hint={`Cierre estimado ${hhmm(sim.etaAt)}`} />
        <Kpi label="Compradores" value={sim.connected} hint="Conectados ahora" />
        <Kpi label="Ofertas por minuto" value={String(sim.ofertasPerMin).replace('.', ',')} hint={`${sim.totalOfertas} en total`} />
      </dl>

      <section aria-label="Avisos">
        <SectionHead title="Qué necesita tu atención" />
        <div className="mt-4">
          <AlertList alerts={sim.alerts} />
        </div>
      </section>

      <section aria-label="Pulso del remate">
        <SectionHead title="Pulso del remate" hint="Ofertas por minuto en la última hora, con cada apertura y cierre de lote." />
        <div className="mt-4">
          <PulseChart buckets={sim.buckets} events={sim.events} height={208} />
        </div>
      </section>

      <div className="grid gap-x-12 gap-y-10 lg:grid-cols-2">
        <section aria-label="Avance de lotes">
          <SectionHead title="Avance de lotes" hint={`Quedan ${sim.remainingLotes} por rematar.`} />
          <div className="mt-4">
            <LoteStrip cells={sim.lotesMap} />
          </div>
        </section>
        <section aria-label="Últimos movimientos">
          <SectionHead title="Últimos movimientos" />
          <div className="mt-2">
            <EventFeed sim={sim} limit={5} />
          </div>
        </section>
      </div>
    </div>
  );
}

function Indicator({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-3">
      <div className="min-w-0">
        <dt className="text-sm font-medium text-ink">{label}</dt>
        <dd className="text-xs text-ink-faint">{hint}</dd>
      </div>
      <dd className="shrink-0 text-lg font-semibold tabular-nums text-ink">{value}</dd>
    </div>
  );
}

function Analisis({ sim }: { sim: EmpresaSim }) {
  const closed = sim.sold.length + sim.unsold.length;
  const sellThrough = closed > 0 ? Math.round((sim.sold.length / closed) * 100) : 0;
  const offersPerSold = sim.sold.length > 0 ? sim.sold.reduce((s, r) => s + r.offers, 0) / sim.sold.length : 0;
  const peak = Math.max(...sim.buckets.map((b) => b.count));
  const peakBucket = sim.buckets.find((b) => b.count === peak);
  const connMax = Math.max(...sim.connHistory);

  return (
    <div className="flex flex-col gap-12">
      <div className="grid gap-x-12 gap-y-10 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <section aria-label="Pulso del remate" className="min-w-0">
          <SectionHead title="Pulso del remate" hint="Ofertas por minuto. Los picos suelen coincidir con el cierre de cada lote." />
          <div className="mt-4">
            <PulseChart buckets={sim.buckets} events={sim.events} height={260} />
          </div>
        </section>
        <section aria-label="Indicadores" className="min-w-0">
          <SectionHead title="Indicadores" />
          <dl className="mt-2 divide-y divide-line">
            <Indicator label="Lotes vendidos" value={`${sellThrough} %`} hint={`${sim.sold.length} de ${closed} lotes cerrados`} />
            <Indicator label="Sobre el precio base" value={`+${sim.upliftPct.toFixed(0)} %`} hint="Promedio de los lotes vendidos" />
            <Indicator label="Ticket promedio" value={pesoCorto(sim.avgTicket)} hint="Por lote vendido" />
            <Indicator label="Ofertas por lote vendido" value={offersPerSold.toFixed(0)} hint="Más ofertas, más competencia" />
            <Indicator label="Duración por lote" value={duration(sim.avgLoteMs)} hint="Promedio entre abrir y cerrar" />
            <Indicator label="Pico de ofertas" value={`${peak}/min`} hint={peakBucket ? `A las ${hhmm(peakBucket.t)}` : ''} />
          </dl>
        </section>
      </div>

      <div className="grid gap-x-12 gap-y-10 lg:grid-cols-2">
        <section aria-label="Recaudación" className="min-w-0">
          <SectionHead title="Recaudación" hint="Lo vendido hasta ahora y el piso estimado si lo que queda cierra a precio base." />
          <div className="mt-4">
            <RevenueChart sold={sim.sold} startAt={sim.startedAt} now={sim.now} etaAt={sim.etaAt} floorExtra={sim.queueBase} />
          </div>
        </section>
        <section aria-label="Audiencia" className="min-w-0">
          <SectionHead title="Audiencia" hint="Compradores conectados en los últimos minutos." />
          <div className="mt-5 flex items-end gap-6">
            <div>
              <p className="text-5xl font-semibold tracking-tight tabular-nums">{sim.connected}</p>
              <p className="mt-1 text-sm text-ink-muted">ahora · máximo {connMax}</p>
            </div>
            <Sparkline values={sim.connHistory} width={260} height={64} />
          </div>
          <div className="mt-8">
            <h3 className="mb-3 text-sm font-semibold text-ink">Lotes por estado</h3>
            <SegBar
              parts={[
                { label: 'Vendidos', value: sim.sold.length, color: '#16a34a' },
                { label: 'En remate', value: sim.active ? 1 : 0, color: '#f59e0b' },
                { label: 'En cola', value: sim.upcoming.length, color: '#c6d2fc' },
                { label: 'Desiertos', value: sim.unsold.length, color: '#fca5a5' },
              ]}
            />
          </div>
        </section>
      </div>

      <section aria-label="Resultado por lote">
        <SectionHead title="Resultado por lote" hint="Cómo cerró cada lote contra su precio base." />
        <div className="mt-4">
          <ResultsTable sim={sim} />
        </div>
      </section>
    </div>
  );
}

function Lotes({ sim }: { sim: EmpresaSim }) {
  return (
    <div className="flex flex-col gap-12">
      <section aria-label="Mapa de lotes">
        <SectionHead title="Todos los lotes" hint="Un casillero por lote, en el orden del catálogo. Pasá el mouse para ver el título y el precio final." />
        <div className="mt-4">
          <LoteStrip cells={sim.lotesMap} />
        </div>
      </section>
      <div className="grid gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <section aria-label="Próximos lotes">
          <SectionHead title="Próximos lotes" hint={`${sim.upcoming.length} en cola · ${pesoCorto(sim.queueBase)} a precio base.`} />
          <div className="mt-3">
            <UpcomingList sim={sim} limit={6} />
          </div>
        </section>
        <section aria-label="Lotes desiertos">
          <SectionHead title="Lotes desiertos" hint="Sin ofertas. Podés volver a rematarlos." />
          <div className="mt-3">
            <DesiertosList sim={sim} />
          </div>
        </section>
      </div>
      <section aria-label="Resultado por lote">
        <SectionHead title="Resultado por lote" />
        <div className="mt-4">
          <ResultsTable sim={sim} />
        </div>
      </section>
    </div>
  );
}
