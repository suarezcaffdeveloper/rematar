import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Clock, Users } from 'lucide-react';
import { MOCK_REMATE } from './previewConsola/mockData';
import { ChatPanel, OfferList, QuickPanels, clock } from './previewConsola/shared';
import { LoteStrip, PriceLadder, PulseChart, RevenueChart, Sparkline, duration, hhmm, pesoCorto, peso } from './previewEmpresa/charts';
import {
  ActiveFacts,
  AlertList,
  DesiertosList,
  EmpresaSwitch,
  EventFeed,
  LeaderPrice,
  LotePhoto,
  OperatorChip,
  QuietMeter,
  ResultsTable,
  SectionHead,
  StatusPill,
  UpcomingList,
} from './previewEmpresa/parts';
import { useEmpresaSim, type EmpresaSim } from './previewEmpresa/sim';

/**
 * Vista previa A del panel de la empresa en un remate en vivo: "Tablero". Una sola página que
 * se lee de arriba abajo, con el mismo lenguaje editorial que el resto de los paneles de la
 * empresa (fondo blanco, líneas finas en vez de tarjetas, números grandes).
 *
 * Orden = prioridad: primero si el remate está sano (estado, martillero, avisos), después una
 * franja de seis cifras que responde "¿cómo voy?", luego el lote en remate con su escalera de
 * precio y, más abajo, el análisis (pulso de ofertas, recaudación, mapa de lotes, resultados).
 * A la derecha, siempre a la vista, las ofertas y el chat con moderación.
 * Simulación sin backend: `?martillero=0`, `?estado=pausado`, `?stream=0`.
 */
export function PreviewEmpresaAPage() {
  const sim = useEmpresaSim();
  const urgent = sim.alerts.filter((a) => a.level !== 'info');
  const pending = sim.alerts.filter((a) => a.level === 'info');

  return (
    <div className="min-h-screen bg-white font-display text-ink">
      <Header sim={sim} />

      <div className="mx-auto w-full max-w-[110rem] px-3 sm:px-6 lg:px-10">
        {urgent.length > 0 && (
          <div className="pt-5">
            <AlertList alerts={urgent} />
          </div>
        )}

        <Ribbon sim={sim} />

        <div className="grid gap-x-12 xl:grid-cols-[minmax(0,1fr)_25rem]">
          <main className="min-w-0 pb-24">
            <NowInRoom sim={sim} />
            <Block title="Pulso del remate" hint="Ofertas por minuto en la última hora. Las marcas muestran cuándo abrió, se vendió o quedó desierto cada lote.">
              <PulseChart buckets={sim.buckets} events={sim.events} />
              <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-muted">
                <Legend color="bg-brand-500" label="Ofertas en el minuto" />
                <Legend color="bg-warning-500" label="Abrió un lote" />
                <Legend color="bg-success-500" label="Lote vendido" />
                <Legend color="bg-ink-faint" label="Lote desierto" />
              </ul>
            </Block>

            <div className="mt-10 grid gap-x-12 gap-y-10 border-t border-line pt-8 lg:grid-cols-2">
              <Block inGrid title="Recaudación" hint="Lo vendido hasta ahora y el piso estimado si lo que queda cierra en su precio base.">
                <RevenueChart
                  sold={sim.sold}
                  startAt={sim.startedAt}
                  now={sim.now}
                  etaAt={sim.etaAt}
                  floorExtra={sim.queueBase}
                />
              </Block>
              <Block inGrid title="Avance de lotes" hint="Un casillero por lote, en el orden del catálogo.">
                <LoteStrip cells={sim.lotesMap} />
                <div className="mt-6">
                  <h3 className="text-sm font-semibold text-ink">Últimos movimientos</h3>
                  <EventFeed sim={sim} limit={5} />
                </div>
              </Block>
            </div>

            <Block title="Resultado por lote" hint="Cómo cerró cada lote contra su precio base.">
              <ResultsTable sim={sim} />
            </Block>

            <div className="mt-10 grid gap-x-12 gap-y-10 border-t border-line pt-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
              <Block inGrid title="Próximos lotes" hint={`${sim.upcoming.length} en cola.`}>
                <UpcomingList sim={sim} />
              </Block>
              <Block inGrid title="Lotes desiertos" hint="Sin ofertas. Podés volver a rematarlos.">
                <DesiertosList sim={sim} />
              </Block>
            </div>
          </main>

          <aside aria-label="Ofertas, chat y moderación" className="min-w-0 border-t border-line pb-24 pt-8 xl:border-l xl:border-t-0 xl:pl-8">
            <div className="flex flex-col gap-8 xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)]">
              {pending.length > 0 && (
                <section aria-label="Pendientes">
                  <h2 className="mb-3 text-base font-semibold tracking-tight">Pendientes</h2>
                  <AlertList alerts={pending} compact />
                </section>
              )}
              <OfferList sim={sim} className="h-[16rem] shrink-0" />
              <ChatPanel sim={sim} className="h-[28rem] min-h-0 flex-1" />
            </div>
          </aside>
        </div>
      </div>

      <EmpresaSwitch current="a" onReset={() => window.location.reload()} />
    </div>
  );
}

/* ----------------------------------------------------------------------- piezas */

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <li className="inline-flex items-center gap-1.5">
      <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${color}`} /> {label}
    </li>
  );
}

function Block({ title, hint, children, inGrid = false }: { title: string; hint?: string; children: ReactNode; inGrid?: boolean }) {
  return (
    <section className={inGrid ? 'min-w-0' : 'mt-10 border-t border-line pt-8'} aria-label={title}>
      <SectionHead title={title} hint={hint} />
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Header({ sim }: { sim: EmpresaSim }) {
  return (
    <header className="border-b border-line">
      <div className="mx-auto flex w-full max-w-[110rem] flex-wrap items-center justify-between gap-x-8 gap-y-3 px-3 py-4 sm:px-6 lg:px-10">
        <div className="flex min-w-0 items-center gap-4">
          <Link
            to="/"
            aria-label="Volver a Mis remates"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line text-ink-muted transition-colors hover:border-ink hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          </Link>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">{MOCK_REMATE.title}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-ink-muted">
              <StatusPill sim={sim} />
              <OperatorChip sim={sim} />
              <span className="inline-flex items-center gap-1.5 tabular-nums" title="Tiempo transcurrido desde la fecha programada">
                <Clock className="h-4 w-4 text-ink-faint" aria-hidden="true" /> {clock(sim.elapsedSeconds)}
              </span>
              <span className="inline-flex items-center gap-1.5 tabular-nums">
                <Users className="h-4 w-4 text-ink-faint" aria-hidden="true" /> {sim.connected} conectados
              </span>
            </p>
          </div>
        </div>
        <QuickPanels />
      </div>
    </header>
  );
}

/** Seis cifras que responden "¿cómo voy?" sin entrar a ningún gráfico. */
function Ribbon({ sim }: { sim: EmpresaSim }) {
  const closed = sim.sold.length + sim.unsold.length;
  const items: { label: string; value: ReactNode; sub: ReactNode }[] = [
    { label: 'Recaudado', value: peso(sim.revenue), sub: `${sim.sold.length} ${sim.sold.length === 1 ? 'lote vendido' : 'lotes vendidos'}` },
    { label: 'Lotes cerrados', value: `${closed} de ${sim.totalLotes}`, sub: `${sim.unsold.length} desiertos · ${sim.remainingLotes} por rematar` },
    { label: 'Sobre el precio base', value: `+${sim.upliftPct.toFixed(0)} %`, sub: `ticket promedio ${pesoCorto(sim.avgTicket)}` },
    { label: 'Compradores', value: String(sim.connected), sub: <Sparkline values={sim.connHistory} width={96} height={22} /> },
    { label: 'Ofertas por minuto', value: String(sim.ofertasPerMin).replace('.', ','), sub: `${sim.totalOfertas} ofertas en total` },
    { label: 'Cierre estimado', value: hhmm(sim.etaAt), sub: `~${duration(sim.avgLoteMs)} por lote` },
  ];
  return (
    <dl className="grid grid-cols-2 gap-y-6 border-b border-line py-7 sm:grid-cols-3 xl:grid-cols-6 xl:divide-x xl:divide-line">
      {items.map((item) => (
        <div key={item.label} className="flex min-w-0 flex-col gap-1 xl:px-6 xl:first:pl-0 xl:last:pr-0">
          <dt className="text-xs text-ink-faint">{item.label}</dt>
          <dd className="truncate text-2xl font-semibold tracking-tight tabular-nums text-ink">{item.value}</dd>
          <dd className="min-h-[1.25rem] text-xs text-ink-muted tabular-nums">{item.sub}</dd>
        </div>
      ))}
    </dl>
  );
}

/** El lote que está en remate: foto, precio líder, qué tan quieto está y cómo escaló. */
function NowInRoom({ sim }: { sim: EmpresaSim }) {
  const lote = sim.active;
  return (
    <section className="pt-8" aria-label="Lote en remate">
      <SectionHead
        title={lote ? `Lote ${lote.number} en remate` : 'Entre lotes'}
        hint={lote ? lote.category : sim.upcoming[0] ? `El martillero va a abrir el lote ${sim.upcoming[0].number}.` : 'No quedan lotes por abrir.'}
      />
      {lote && (
        <div className="mt-5 grid gap-6 md:grid-cols-[16rem_minmax(0,1fr)] lg:grid-cols-[20rem_minmax(0,1fr)]">
          <LotePhoto lote={lote} className="aspect-[4/3] w-full" />
          <div className="flex min-w-0 flex-col gap-5">
            <div>
              <p className="line-clamp-2 text-base font-medium text-ink-muted">{lote.title}</p>
              <p className="mt-2 text-xs text-ink-faint">Oferta líder</p>
              <p className="text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
                <LeaderPrice amount={sim.winning?.amount ?? null} />
              </p>
            </div>
            <ActiveFacts sim={sim} />
            <QuietMeter seconds={sim.secondsSinceLastOffer} />
          </div>
        </div>
      )}
      {lote && (
        <div className="mt-6">
          <h3 className="mb-2 text-sm font-semibold text-ink">Cómo escaló el precio</h3>
          <PriceLadder offers={sim.offers} base={lote.basePrice} now={sim.now} />
        </div>
      )}
    </section>
  );
}
