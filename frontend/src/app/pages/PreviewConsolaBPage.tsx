import { useEffect, useState, type ReactNode } from 'react';
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
 * Vista previa B de la Consola Operativa del rematador: "Cabina". Una consola oscura de una
 * sola pasada, pensada para operar sin scrollear: el escenario del lote con el precio líder
 * enorme y un medidor de "tiempo sin ofertas", la cola de lotes (próximos y desiertos) en una
 * tira, y abajo un dock de comandos agrupado por riesgo con atajos de teclado (A adjudicar,
 * N siguiente, O abrir, C cerrar, P pausar, R reanudar). A la derecha, ofertas y chat siempre
 * visibles. Simulación sin backend (`useConsolaSim`).
 */
export function PreviewConsolaBPage() {
  const sim = useConsolaSim();
  useHotkeys(sim);

  return (
    <div className="min-h-screen bg-ink font-display text-white">
      <div className="mx-auto grid w-full max-w-[120rem] gap-3 p-3 sm:p-4 xl:grid-cols-[minmax(0,1fr)_25rem]">
        <div className="flex min-w-0 flex-col gap-3">
          <TopBar sim={sim} />
          <Stage sim={sim} />
          <Queue sim={sim} />
          <Dock sim={sim} />
        </div>

        <aside
          aria-label="Ofertas y chat"
          className="flex min-h-[40rem] min-w-0 flex-col gap-5 rounded-2xl border border-white/10 bg-white/[0.04] p-5 xl:sticky xl:top-4 xl:h-[calc(100vh-2rem)]"
        >
          <OfferList sim={sim} tone="dark" className="h-[17rem] shrink-0" />
          <div className="h-px shrink-0 bg-white/10" />
          <ChatPanel sim={sim} tone="dark" className="flex-1" />
        </aside>
      </div>

      <ConfirmDialog sim={sim} />
      <AdjudicatedOverlay sim={sim} />
      <ToastStack toasts={sim.toasts} />
      <PreviewSwitch current="b" onReset={sim.reset} />
    </div>
  );
}

/** Atajos de teclado de la botonera (no se activan mientras se escribe en un campo). */
function useHotkeys(sim: ConsolaSim) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (sim.pendingConfirm || sim.adjudicated) return;
      switch (e.key.toLowerCase()) {
        case 'a':
          sim.adjudicate();
          break;
        case 'n':
          sim.openNext();
          break;
        case 'o':
          sim.openSelected();
          break;
        case 'c':
          sim.closeAsDesierto();
          break;
        case 'p':
          if (sim.isLive) sim.setPendingConfirm('pause');
          break;
        case 'r':
          sim.resume();
          break;
        default:
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [sim]);
}

const PANEL = 'rounded-2xl border border-white/10 bg-white/[0.04]';

/* ------------------------------------------------------------------ barra superior */

function TopBar({ sim }: { sim: ConsolaSim }) {
  return (
    <header className={`${PANEL} flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-3 sm:px-5`}>
      <div className="flex min-w-0 items-center gap-4">
        <Link
          to="/"
          aria-label="Salir de la consola"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/15 text-white/70 transition-colors hover:border-white hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </Link>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold tracking-tight sm:text-xl">{MOCK_REMATE.title}</h1>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-white/60">
            <Status sim={sim} />
            <span className="tabular-nums">Inició {MOCK_REMATE.startsAt}</span>
            <span className="inline-flex items-center gap-1.5 tabular-nums" title="Tiempo transcurrido desde la fecha programada">
              <Clock className="h-4 w-4 text-white/40" aria-hidden="true" /> {clock(sim.elapsedSeconds)}
            </span>
            <span className="inline-flex items-center gap-1.5 tabular-nums">
              <Users className="h-4 w-4 text-white/40" aria-hidden="true" /> {sim.connected} conectados
            </span>
          </p>
        </div>
      </div>
      <QuickPanels tone="dark" />
    </header>
  );
}

function Status({ sim }: { sim: ConsolaSim }) {
  if (sim.state === 'live')
    return (
      <span className="inline-flex items-center gap-2 font-semibold text-success-400">
        <LiveDot /> En vivo
      </span>
    );
  if (sim.state === 'paused')
    return (
      <span className="inline-flex items-center gap-2 font-semibold text-warning-500">
        <PauseCircle className="h-4 w-4" aria-hidden="true" /> Pausado
      </span>
    );
  return <span className="font-semibold text-white/60">Finalizado</span>;
}

/* ---------------------------------------------------------------------- escenario */

function Stage({ sim }: { sim: ConsolaSim }) {
  const lote = sim.active;

  if (sim.state === 'finished' || !lote) {
    const finished = sim.state === 'finished';
    return (
      <section aria-label="Lote en remate" className={`${PANEL} flex min-h-[28rem] flex-col items-start justify-center gap-3 px-8 py-12 sm:px-12`}>
        <Gavel className="h-10 w-10 text-white/40" aria-hidden="true" />
        <h2 className="text-3xl font-semibold tracking-tight">
          {finished
            ? 'El remate finalizó correctamente'
            : sim.upcoming.length > 0
              ? 'Sin lote activo en este momento'
              : 'Todos los lotes fueron procesados'}
        </h2>
        <p className="max-w-lg text-white/65">
          {finished
            ? 'No queda ninguna operación pendiente. Podés revisar el resumen completo con los resultados de cada lote.'
            : sim.upcoming.length > 0
              ? 'Abrí un lote con "Pasar al siguiente lote" o elegí uno de la cola para empezar a recibir ofertas.'
              : 'No quedan lotes pendientes. Revisá los desiertos si querés volver a ofrecer alguno, o finalizá el remate cuando corresponda.'}
        </p>
      </section>
    );
  }

  const idle = sim.secondsSinceLastOffer;
  const total = sim.soldCount + 1 + sim.upcoming.length + sim.desiertos.length;
  const meter = idle === null ? 0 : Math.min(100, (idle / 30) * 100);
  const meterTone = idle === null ? 'bg-white/30' : idle < 15 ? 'bg-success-400' : idle < 30 ? 'bg-warning-500' : 'bg-danger-500';
  const previous = sim.offers[1];
  const step = sim.winning && previous ? sim.winning.amount - previous.amount : null;

  return (
    <section aria-label="Lote en remate" className={`${PANEL} relative grid gap-0 overflow-hidden lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]`}>
      {sim.isPaused && (
        <p className="absolute inset-x-0 top-0 z-10 flex items-center justify-center gap-2 bg-warning-500 px-4 py-2 text-sm font-semibold text-ink">
          <PauseCircle className="h-4 w-4" aria-hidden="true" />
          Remate pausado: los compradores no pueden ofertar
        </p>
      )}

      <div className={`flex p-4 sm:p-5 ${sim.isPaused ? 'pt-14' : ''}`}>
        <Gallery lote={lote} tone="dark" className="min-h-[22rem] flex-1" />
      </div>

      <div className={`flex min-w-0 flex-col gap-5 border-t border-white/10 p-5 sm:p-6 lg:border-l lg:border-t-0 ${sim.isPaused ? 'lg:pt-14' : ''}`}>
        <div>
          <p className="flex flex-wrap items-center gap-3 text-sm text-white/60">
            <span className="font-medium text-white">
              Lote {lote.number} de {total}
            </span>
            <span>{lote.category}</span>
            <span className="rounded-full bg-warning-500/20 px-2.5 py-0.5 text-xs font-medium text-warning-500">Abierto</span>
          </p>
          <h2 className="mt-2 text-balance text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">{lote.title}</h2>
        </div>

        <div>
          <p className="text-sm text-white/60">{sim.winning ? 'Oferta líder' : 'Precio inicial'}</p>
          <p
            key={sim.winning?.id ?? 'base'}
            className="mt-1 animate-price-flash font-mono text-5xl font-semibold leading-none tabular-nums tracking-tight sm:text-6xl"
          >
            {money(sim.winning?.amount ?? lote.basePrice)}
          </p>
          <div className="mt-3 flex min-h-7 flex-wrap items-center gap-2">
            {sim.winning ? (
              <span className="inline-flex items-center gap-2 rounded-full bg-success-500/20 px-3 py-1 text-sm font-medium text-success-400">
                Lidera un comprador verificado{step ? ` · +${money(step)}` : ''}
              </span>
            ) : (
              <span className="text-sm text-white/60">Todavía no hay ofertas en este lote.</span>
            )}
          </div>
        </div>

        <div>
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-white/60">Tiempo sin ofertas</span>
            <span className="font-medium tabular-nums">{idle === null ? '—' : ago(idle)}</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={30} aria-valuenow={Math.min(idle ?? 0, 30)} aria-label="Segundos sin ofertas">
            <div className={`h-full rounded-full transition-all duration-1000 ease-linear ${meterTone}`} style={{ width: `${meter}%` }} />
          </div>
        </div>

        <dl className="grid grid-cols-3 border-y border-white/10 text-sm">
          <Mini label="Precio inicial" value={money(lote.basePrice)} />
          <Mini label="Incremento" value={money(lote.minIncrement)} />
          <Mini label="Ofertas" value={String(sim.offers.length)} />
        </dl>

        <p className="text-sm leading-relaxed text-white/65">{lote.description}</p>
        <FichaTecnica lote={lote} tone="dark" columns="sm:grid-cols-2" />
      </div>
    </section>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-white/10 px-0 py-3 first:pl-0 [&:not(:first-child)]:border-l [&:not(:first-child)]:pl-4">
      <dt className="text-xs text-white/50">{label}</dt>
      <dd className="mt-0.5 font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

/* ---------------------------------------------------------------------- cola de lotes */

function Queue({ sim }: { sim: ConsolaSim }) {
  const [tab, setTab] = useState<'proximos' | 'desiertos'>('proximos');
  const selectionEnabled = sim.canOpenLote;

  return (
    <section aria-label="Cola de lotes" className={`${PANEL} p-4 sm:p-5`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Cola de lotes" className="flex gap-1 rounded-full bg-white/[0.07] p-1">
          <QueueTab active={tab === 'proximos'} onClick={() => setTab('proximos')} label="Próximos lotes" count={sim.upcoming.length} />
          <QueueTab active={tab === 'desiertos'} onClick={() => setTab('desiertos')} label="Lotes desiertos" count={sim.desiertos.length} />
        </div>
        <p className="text-sm text-white/55">
          {tab === 'proximos'
            ? selectionEnabled
              ? 'Hacé click en un lote para seleccionarlo y abrirlo.'
              : 'La selección se habilita cuando no hay un lote abierto.'
            : 'Sin ofertas. Podés volver a ofrecerlos al final de la cola.'}
        </p>
      </div>

      {tab === 'proximos' ? (
        sim.upcoming.length === 0 ? (
          <p className="mt-4 text-sm text-white/60">No hay más lotes cargados en este remate.</p>
        ) : (
          <ul className="mt-4 flex gap-3 overflow-x-auto pb-2 [color-scheme:dark] [scrollbar-width:thin]">
            {sim.upcoming.map((lote, index) => (
              <li key={lote.id} className="shrink-0">
                <QueueTile
                  lote={lote}
                  badge={index === 0 ? 'Sigue' : undefined}
                  selected={sim.selectedId === lote.id}
                  disabled={!selectionEnabled}
                  onClick={() => sim.setSelectedId(sim.selectedId === lote.id ? null : lote.id)}
                  footer={`Desde ${money(lote.basePrice)}`}
                />
              </li>
            ))}
          </ul>
        )
      ) : sim.desiertos.length === 0 ? (
        <p className="mt-4 text-sm text-white/60">No hay lotes desiertos.</p>
      ) : (
        <ul className="mt-4 flex gap-3 overflow-x-auto pb-2 [color-scheme:dark] [scrollbar-width:thin]">
          {sim.desiertos.map((lote) => (
            <li key={lote.id} className="shrink-0">
              <div className="flex w-60 flex-col gap-3">
                <QueueTile lote={lote} badge="Desierto" disabled footer={lote.requeuePreset ? `Desde ${money(lote.requeuePreset)}` : undefined} />
                {lote.requeuePreset !== null && lote.requeuePreset !== undefined ? (
                  <button
                    type="button"
                    onClick={() => sim.requeue(lote)}
                    className="inline-flex items-center justify-center gap-1.5 rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                  >
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                    Volver a rematar
                  </button>
                ) : (
                  <p className="text-xs leading-snug text-white/55">Necesita que la empresa defina un precio para reincorporarlo.</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function QueueTab({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
        active ? 'bg-white text-ink' : 'text-white/65 hover:text-white'
      }`}
    >
      {label} <span className={`ml-1 tabular-nums ${active ? 'text-ink-muted' : 'text-white/40'}`}>{count}</span>
    </button>
  );
}

function QueueTile({
  lote,
  badge,
  selected,
  disabled,
  onClick,
  footer,
}: {
  lote: MockLote;
  badge?: string;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  footer?: string;
}) {
  const content = (
    <>
      <img
        src={lote.images[0]}
        alt=""
        className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out group-enabled:group-hover:scale-105"
      />
      <span className="absolute inset-0 bg-gradient-to-t from-ink via-ink/35 to-transparent" />
      <span className="absolute left-3 top-3 flex gap-1.5">
        <span className="rounded-full bg-white/90 px-2.5 py-0.5 text-xs font-medium text-ink backdrop-blur">Lote {lote.number}</span>
        {badge && <span className="rounded-full bg-brand-600 px-2.5 py-0.5 text-xs font-medium text-white">{badge}</span>}
      </span>
      <span className="absolute inset-x-0 bottom-0 p-3.5">
        <span className="block line-clamp-2 text-balance text-sm font-semibold leading-snug">{lote.title}</span>
        {footer && <span className="mt-1 block font-mono text-xs tabular-nums text-white/70">{footer}</span>}
      </span>
    </>
  );
  const cls = `group relative block h-44 w-60 overflow-hidden rounded-xl bg-ink text-left text-white transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
    selected ? 'ring-2 ring-white ring-offset-2 ring-offset-ink' : ''
  }`;
  return onClick ? (
    <button type="button" onClick={onClick} disabled={disabled} aria-pressed={selected} className={`${cls} disabled:cursor-default`}>
      {content}
    </button>
  ) : (
    <div className={cls}>{content}</div>
  );
}

/* ------------------------------------------------------------------------- dock */

const DOCK_BTN =
  'inline-flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-ink disabled:cursor-not-allowed disabled:opacity-35';

function Kbd({ children, dark = false }: { children: ReactNode; dark?: boolean }) {
  return (
    <kbd className={`rounded px-1.5 py-0.5 font-sans text-[11px] font-semibold ${dark ? 'bg-ink/10 text-ink/70' : 'bg-white/15 text-white/70'}`}>
      {children}
    </kbd>
  );
}

function DockGroup({ title, children, tone = 'default' }: { title: string; children: ReactNode; tone?: 'default' | 'danger' }) {
  return (
    <div className="flex flex-col gap-2">
      <h2 className={`text-xs font-semibold ${tone === 'danger' ? 'text-danger-400' : 'text-white/45'}`}>{title}</h2>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function Dock({ sim }: { sim: ConsolaSim }) {
  const lote = sim.active;
  const canAdjudicate = (sim.isLive || sim.isPaused) && Boolean(lote && sim.winning);

  return (
    <section aria-label="Botonera de gestión" className={`${PANEL} flex flex-wrap items-end gap-x-6 gap-y-4 p-4 sm:p-5`}>
      <DockGroup title="Gestión del lote">
        <button
          type="button"
          onClick={sim.adjudicate}
          disabled={!canAdjudicate}
          title={lote && !sim.winning ? 'Este lote todavía no tiene ninguna oferta.' : undefined}
          className={`${DOCK_BTN} !px-5 bg-white text-ink hover:bg-brand-50`}
        >
          <Gavel className="h-4 w-4" aria-hidden="true" />
          Adjudicar lote <Kbd dark>A</Kbd>
        </button>
        <button
          type="button"
          onClick={sim.openNext}
          disabled={!sim.canOpenLote || sim.upcoming.length === 0}
          className={`${DOCK_BTN} bg-brand-600 text-white hover:bg-brand-500`}
        >
          <ChevronsRight className="h-4 w-4" aria-hidden="true" />
          Pasar al siguiente <Kbd>N</Kbd>
        </button>
        <button
          type="button"
          onClick={sim.openSelected}
          disabled={!sim.canOpenLote || !sim.selectedId}
          title={!sim.selectedId ? 'Seleccioná un lote en la cola primero.' : undefined}
          className={`${DOCK_BTN} border border-white/20 text-white hover:bg-white/10`}
        >
          <PlayCircle className="h-4 w-4" aria-hidden="true" />
          Abrir lote <Kbd>O</Kbd>
        </button>
        <button
          type="button"
          onClick={sim.closeAsDesierto}
          disabled={!(sim.isLive || sim.isPaused) || !lote || Boolean(sim.winning)}
          title={lote && sim.winning ? 'Este lote tiene ofertas: adjudicalo o esperá a que se retracten.' : undefined}
          className={`${DOCK_BTN} border border-white/20 text-white hover:bg-white/10`}
        >
          <PackageCheck className="h-4 w-4" aria-hidden="true" />
          Cerrar lote <Kbd>C</Kbd>
        </button>
      </DockGroup>

      <span className="hidden h-12 w-px self-end bg-white/10 lg:block" aria-hidden="true" />

      <DockGroup title="Controles del remate">
        <button
          type="button"
          onClick={() => sim.setPendingConfirm('pause')}
          disabled={!sim.isLive}
          className={`${DOCK_BTN} border border-warning-500/50 text-warning-500 hover:bg-warning-500/10`}
        >
          <PauseCircle className="h-4 w-4" aria-hidden="true" />
          Pausar <Kbd>P</Kbd>
        </button>
        <button
          type="button"
          onClick={sim.resume}
          disabled={!sim.isPaused}
          className={`${DOCK_BTN} border border-white/20 text-white hover:bg-white/10`}
        >
          <PlayCircle className="h-4 w-4" aria-hidden="true" />
          Reanudar <Kbd>R</Kbd>
        </button>
      </DockGroup>

      <div className="ml-auto flex flex-col items-end">
        <DockGroup title="Zona crítica" tone="danger">
          <button
            type="button"
            onClick={() => sim.setPendingConfirm('finish')}
            disabled={!sim.isLive || Boolean(lote)}
            title={lote ? 'Cerrá el lote abierto antes de finalizar el remate.' : undefined}
            className={`${DOCK_BTN} border border-danger-400/50 text-danger-400 hover:bg-danger-500/10`}
          >
            <XOctagon className="h-4 w-4" aria-hidden="true" />
            Finalizar remate
          </button>
        </DockGroup>
      </div>
    </section>
  );
}
