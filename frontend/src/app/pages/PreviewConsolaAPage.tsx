import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  ChevronsRight,
  Clock,
  Gavel,
  PackageCheck,
  PauseCircle,
  PlayCircle,
  RotateCcw,
  Users,
  XOctagon,
} from 'lucide-react';
import { LiveDot } from './previewInicio/shared';
import { MOCK_REMATE, type MockLote } from './previewConsola/mockData';
import { useConsolaSim, type ConsolaSim } from './previewConsola/useConsolaSim';
import {
  AdjudicatedOverlay,
  ChatPanel,
  ConfirmDialog,
  FichaTecnica,
  Gallery,
  OfferList,
  PreviewSwitch,
  QuickPanels,
  ToastStack,
  ago,
  clock,
  money,
} from './previewConsola/shared';

/**
 * Vista previa A de la Consola Operativa del rematador: "Mesa de mando". Mismo lenguaje que la
 * Sala del comprador (tres columnas separadas por líneas, no por tarjetas): a la izquierda el
 * lote en remate con su ficha, en el centro la mesa de control (la oferta líder en grande, la
 * botonera ordenada por riesgo y las ofertas recientes) y a la derecha el chat, que se queda
 * fijo. Debajo, los próximos lotes y los desiertos. Simulación sin backend: llegan ofertas y
 * mensajes solos y los botones funcionan (`useConsolaSim`).
 */
export function PreviewConsolaAPage() {
  const sim = useConsolaSim();

  return (
    <div className="min-h-screen bg-white font-display text-ink">
      <Header sim={sim} />

      <div className="mx-auto w-full max-w-[110rem] xl:grid xl:grid-cols-[minmax(0,1.45fr)_minmax(22rem,1fr)_minmax(19rem,0.8fr)]">
        <section aria-label="Lote en remate" className="min-w-0 px-3 py-6 sm:px-6 lg:px-10 xl:pr-8">
          <LoteStage sim={sim} />
        </section>

        <section
          aria-label="Mesa de control"
          className="min-w-0 border-t border-line bg-brand-50/40 xl:border-l xl:border-t-0"
        >
          <div className="px-3 py-6 sm:px-6 lg:px-8 xl:sticky xl:top-0 xl:max-h-screen xl:overflow-y-auto">
            <ControlTable sim={sim} />
          </div>
        </section>

        <aside
          aria-label="Chat"
          className="flex min-h-[32rem] min-w-0 flex-col border-t border-line px-3 py-6 sm:px-6 xl:sticky xl:top-0 xl:row-span-2 xl:h-screen xl:border-l xl:border-t-0 xl:px-5"
        >
          <ChatPanel sim={sim} className="flex-1" />
        </aside>

        <div className="min-w-0 border-t border-line xl:col-span-2">
          <div className="grid gap-12 px-3 py-8 sm:px-6 lg:px-10 2xl:grid-cols-[minmax(0,1fr)_26rem]">
            <UpcomingLotes sim={sim} />
            <Desiertos sim={sim} />
          </div>
        </div>
      </div>

      <ConfirmDialog sim={sim} />
      <AdjudicatedOverlay sim={sim} />
      <ToastStack toasts={sim.toasts} />
      <PreviewSwitch current="a" onReset={sim.reset} />
    </div>
  );
}

/* ------------------------------------------------------------------- encabezado */

function Header({ sim }: { sim: ConsolaSim }) {
  const pending = sim.upcoming.length;
  return (
    <header className="border-b border-line">
      <div className="mx-auto flex w-full max-w-[110rem] flex-wrap items-center justify-between gap-x-8 gap-y-3 px-3 py-4 sm:px-6 lg:px-10">
        <div className="flex min-w-0 items-center gap-4">
          <Link
            to="/"
            aria-label="Salir de la consola"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line text-ink-muted transition-colors hover:border-ink hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          </Link>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">{MOCK_REMATE.title}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-muted">
              <StatusPill sim={sim} />
              <span className="tabular-nums">Inició {MOCK_REMATE.startsAt}</span>
              <span className="inline-flex items-center gap-1.5 tabular-nums" title="Tiempo transcurrido desde la fecha programada">
                <Clock className="h-4 w-4 text-ink-faint" aria-hidden="true" /> {clock(sim.elapsedSeconds)}
              </span>
              <span className="inline-flex items-center gap-1.5 tabular-nums">
                <Users className="h-4 w-4 text-ink-faint" aria-hidden="true" /> {sim.connected} conectados
              </span>
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <dl className="flex gap-6 text-sm">
            <Count label="Vendidos" value={sim.soldCount} />
            <Count label="En cola" value={pending} />
            <Count label="Desiertos" value={sim.desiertos.length} />
          </dl>
          <QuickPanels />
        </div>
      </div>
    </header>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-xs text-ink-faint">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums leading-tight">{value}</dd>
    </div>
  );
}

function StatusPill({ sim }: { sim: ConsolaSim }) {
  if (sim.state === 'live')
    return (
      <span className="inline-flex items-center gap-2 font-semibold text-success-700">
        <LiveDot /> En vivo
      </span>
    );
  if (sim.state === 'paused')
    return (
      <span className="inline-flex items-center gap-2 font-semibold text-warning-700">
        <PauseCircle className="h-4 w-4" aria-hidden="true" /> Pausado
      </span>
    );
  return <span className="font-semibold text-ink-muted">Finalizado</span>;
}

/* --------------------------------------------------------------- lote en remate */

function LoteStage({ sim }: { sim: ConsolaSim }) {
  const lote = sim.active;
  if (sim.state === 'finished') {
    return (
      <Empty
        title="El remate finalizó correctamente"
        text="No queda ninguna operación pendiente. Podés revisar el resumen completo con los resultados de cada lote."
      />
    );
  }
  if (!lote) {
    return (
      <Empty
        title={sim.upcoming.length > 0 ? 'Sin lote activo en este momento' : 'Todos los lotes fueron procesados'}
        text={
          sim.upcoming.length > 0
            ? 'Abrí un lote desde la mesa de control para empezar a recibir ofertas.'
            : 'No quedan lotes pendientes. Revisá los desiertos si querés volver a ofrecer alguno, o finalizá el remate cuando corresponda.'
        }
      />
    );
  }

  const total = sim.soldCount + 1 + sim.upcoming.length + sim.desiertos.length;
  const idle = sim.secondsSinceLastOffer;
  const idleTone = idle === null ? 'bg-ink-faint' : idle < 15 ? 'bg-success-500' : idle < 30 ? 'bg-warning-500' : 'bg-danger-500';

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="flex flex-wrap items-center gap-3 text-sm text-ink-muted">
          <span className="font-medium text-ink">
            Lote {lote.number} de {total}
          </span>
          <span>{lote.category}</span>
          <span className="rounded-full bg-warning-50 px-2.5 py-0.5 text-xs font-medium text-warning-700">Abierto</span>
        </p>
        <h2 className="mt-2 max-w-3xl text-balance text-3xl font-semibold leading-[1.1] tracking-tight sm:text-4xl">{lote.title}</h2>
      </div>

      <Gallery lote={lote} className="h-[22rem] sm:h-[28rem]" />

      <dl className="grid grid-cols-2 border-y border-ink lg:grid-cols-4">
        <Fact label="Precio inicial" value={money(lote.basePrice)} />
        <Fact label="Incremento mínimo" value={money(lote.minIncrement)} />
        <Fact label="Ofertas recibidas" value={String(sim.offers.length)} />
        <Fact
          label="Última oferta"
          value={idle === null ? 'Sin ofertas' : ago(idle)}
          adornment={<span className={`h-2 w-2 rounded-full ${idleTone}`} aria-hidden="true" />}
        />
      </dl>

      <p className="max-w-[65ch] leading-relaxed text-ink-muted">{lote.description}</p>
      <FichaTecnica lote={lote} />
    </div>
  );
}

function Fact({ label, value, adornment }: { label: string; value: string; adornment?: ReactNode }) {
  return (
    <div className="border-line px-0 py-4 lg:border-l lg:px-5 lg:first:border-l-0 lg:first:pl-0">
      <dt className="text-sm text-ink-muted">{label}</dt>
      <dd className="mt-1 flex items-center gap-2 text-lg font-semibold tabular-nums tracking-tight">
        {adornment}
        {value}
      </dd>
    </div>
  );
}

function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="flex min-h-[24rem] flex-col items-start justify-center gap-3 rounded-2xl border border-dashed border-line-strong px-8 py-12">
      <Gavel className="h-9 w-9 text-ink-faint" aria-hidden="true" />
      <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
      <p className="max-w-md text-ink-muted">{text}</p>
    </div>
  );
}

/* -------------------------------------------------------------- mesa de control */

const BTN =
  'inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40';

function ControlTable({ sim }: { sim: ConsolaSim }) {
  const lote = sim.active;
  const previous = sim.offers[1];
  const step = sim.winning && previous ? sim.winning.amount - previous.amount : null;
  const canAdjudicate = (sim.isLive || sim.isPaused) && Boolean(lote && sim.winning);

  return (
    <div className="flex flex-col gap-6">
      {sim.isPaused && (
        <p className="flex items-center gap-2 rounded-xl bg-warning-50 px-4 py-3 text-sm font-medium text-warning-800">
          <PauseCircle className="h-5 w-5 shrink-0" aria-hidden="true" />
          Remate pausado: los compradores no pueden ofertar.
        </p>
      )}

      <div>
        <h2 className="text-sm text-ink-muted">{sim.winning ? 'Oferta líder' : 'Precio inicial'}</h2>
        <p
          key={sim.winning?.id ?? 'base'}
          className="mt-1 animate-price-flash font-mono text-[2.75rem] font-semibold leading-none tabular-nums tracking-tight xl:text-[3.25rem]"
        >
          {lote ? money(sim.winning?.amount ?? lote.basePrice) : '—'}
        </p>
        <div className="mt-3 flex h-7 items-center">
          {sim.winning ? (
            <span className="inline-flex items-center gap-2 rounded-full bg-success-50 px-3 py-1 text-sm font-medium text-success-700">
              Lidera un comprador verificado{step ? ` · +${money(step)}` : ''}
            </span>
          ) : (
            <span className="text-sm text-ink-muted">{lote ? 'Todavía no hay ofertas en este lote.' : 'No hay un lote abierto.'}</span>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-base font-semibold tracking-tight">Gestión del lote</h2>
        <button
          type="button"
          onClick={sim.adjudicate}
          disabled={!canAdjudicate}
          title={lote && !sim.winning ? 'Este lote todavía no tiene ninguna oferta.' : undefined}
          className={`${BTN} !gap-3 !py-4 !text-base bg-ink text-white hover:bg-ink/85`}
        >
          <Gavel className="h-5 w-5" aria-hidden="true" />
          Adjudicar lote{sim.winning ? ` por ${money(sim.winning.amount)}` : ''}
        </button>
        <button
          type="button"
          onClick={sim.openNext}
          disabled={!sim.canOpenLote || sim.upcoming.length === 0}
          className={`${BTN} bg-brand-600 text-white hover:bg-brand-500`}
        >
          <ChevronsRight className="h-4 w-4" aria-hidden="true" />
          Pasar al siguiente lote
        </button>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={sim.openSelected}
            disabled={!sim.canOpenLote || !sim.selectedId}
            title={!sim.selectedId ? 'Seleccioná un lote en "Próximos lotes" primero.' : undefined}
            className={`${BTN} border border-line-strong bg-white text-ink hover:bg-surface-subtle`}
          >
            <PlayCircle className="h-4 w-4" aria-hidden="true" />
            Abrir lote
          </button>
          <button
            type="button"
            onClick={sim.closeAsDesierto}
            disabled={!(sim.isLive || sim.isPaused) || !lote || Boolean(sim.winning)}
            title={lote && sim.winning ? 'Este lote tiene ofertas: adjudicalo o esperá a que se retracten.' : undefined}
            className={`${BTN} border border-line-strong bg-white text-ink hover:bg-surface-subtle`}
          >
            <PackageCheck className="h-4 w-4" aria-hidden="true" />
            Cerrar lote
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-3 border-t border-line pt-6">
        <h2 className="text-base font-semibold tracking-tight">Remate</h2>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => sim.setPendingConfirm('pause')}
            disabled={!sim.isLive}
            className={`${BTN} border border-warning-200 bg-white text-warning-800 hover:bg-warning-50`}
          >
            <PauseCircle className="h-4 w-4" aria-hidden="true" />
            Pausar
          </button>
          <button
            type="button"
            onClick={sim.resume}
            disabled={!sim.isPaused}
            className={`${BTN} border border-line-strong bg-white text-ink hover:bg-surface-subtle`}
          >
            <PlayCircle className="h-4 w-4" aria-hidden="true" />
            Reanudar
          </button>
        </div>
        <div className="mt-2 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => sim.setPendingConfirm('finish')}
            disabled={!sim.isLive || Boolean(lote)}
            title={lote ? 'Cerrá el lote abierto antes de finalizar el remate.' : undefined}
            className={`${BTN} border border-danger-200 bg-white text-danger-700 hover:bg-danger-50`}
          >
            <XOctagon className="h-4 w-4" aria-hidden="true" />
            Finalizar remate
          </button>
          {lote && <p className="text-xs text-ink-muted">Cerrá el lote abierto antes de finalizar el remate.</p>}
        </div>
      </div>

      <OfferList sim={sim} className="max-h-[22rem] border-t border-line pt-6" />
    </div>
  );
}

/* ------------------------------------------------------- próximos y desiertos */

function UpcomingLotes({ sim }: { sim: ConsolaSim }) {
  const selectionEnabled = sim.canOpenLote;
  return (
    <section aria-labelledby="proximos">
      <h2 id="proximos" className="text-2xl font-semibold tracking-tight">
        Próximos lotes
      </h2>
      <p className="mb-5 mt-1 text-sm text-ink-muted">
        {selectionEnabled
          ? 'Hacé click para seleccionar el próximo lote a abrir.'
          : 'La selección se habilita cuando el remate está en vivo y no hay un lote abierto.'}
      </p>
      {sim.upcoming.length === 0 ? (
        <p className="text-sm text-ink-muted">No hay más lotes cargados en este remate.</p>
      ) : (
        <ul className="-mx-3 flex snap-x gap-3 overflow-x-auto px-3 pb-3 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0 [scrollbar-width:thin]">
          {sim.upcoming.map((lote, index) => (
            <li key={lote.id} className="snap-start">
              <UpcomingTile
                lote={lote}
                isNext={index === 0}
                selected={sim.selectedId === lote.id}
                selectable={selectionEnabled}
                onSelect={() => sim.setSelectedId(sim.selectedId === lote.id ? null : lote.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function UpcomingTile({
  lote,
  isNext,
  selected,
  selectable,
  onSelect,
}: {
  lote: MockLote;
  isNext: boolean;
  selected: boolean;
  selectable: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={!selectable}
      aria-pressed={selected}
      className={`group relative block h-60 w-56 overflow-hidden rounded-2xl bg-ink text-left text-white transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-default ${
        selected ? 'ring-2 ring-brand-600 ring-offset-2' : ''
      }`}
    >
      <img
        src={lote.images[0]}
        alt=""
        className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out group-enabled:group-hover:scale-105"
      />
      <span className="absolute inset-0 bg-gradient-to-t from-ink via-ink/30 to-transparent" />
      <span className="absolute left-3 top-3 flex gap-1.5">
        <span className="rounded-full bg-white/90 px-2.5 py-0.5 text-xs font-medium text-ink backdrop-blur">Lote {lote.number}</span>
        {isNext && <span className="rounded-full bg-brand-600 px-2.5 py-0.5 text-xs font-medium text-white">Sigue</span>}
      </span>
      <span className="absolute inset-x-0 bottom-0 p-4">
        <span className="block text-balance text-sm font-semibold leading-snug">{lote.title}</span>
        <span className="mt-1.5 block font-mono text-sm tabular-nums text-white/75">Desde {money(lote.basePrice)}</span>
      </span>
    </button>
  );
}

function Desiertos({ sim }: { sim: ConsolaSim }) {
  if (sim.desiertos.length === 0) return null;
  return (
    <section aria-labelledby="desiertos">
      <h2 id="desiertos" className="text-2xl font-semibold tracking-tight">
        Lotes desiertos
      </h2>
      <p className="mb-5 mt-1 text-sm text-ink-muted">Sin ofertas. Podés volver a ofrecerlos al final de la cola.</p>
      <ul className="divide-y divide-line border-y border-ink">
        {sim.desiertos.map((lote) => (
          <li key={lote.id} className="grid grid-cols-[4rem_minmax(0,1fr)] items-center gap-x-4 gap-y-3 py-4">
            <img src={lote.images[0]} alt="" className="h-14 w-16 rounded-lg object-cover" />
            <div className="min-w-0">
              <p className="text-xs text-ink-muted">Lote {lote.number} · Desierto</p>
              <p className="truncate text-sm font-medium">{lote.title}</p>
            </div>
            <div className="col-span-2 flex items-center justify-between gap-3 pl-0 sm:col-span-2">
              {lote.requeuePreset !== null && lote.requeuePreset !== undefined ? (
                <>
                  <span className="text-xs tabular-nums text-ink-muted">Desde {money(lote.requeuePreset)}</span>
                  <button
                    type="button"
                    onClick={() => sim.requeue(lote)}
                    className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-4 py-2 text-sm font-semibold text-brand-700 transition-colors hover:bg-brand-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                  >
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                    Volver a rematar
                  </button>
                </>
              ) : (
                <span className="text-xs text-ink-muted">Necesita que la empresa defina un precio para reincorporarlo.</span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
