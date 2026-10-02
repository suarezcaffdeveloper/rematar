import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, Check, Copy, Info, KeyRound, RotateCcw, ShieldAlert } from 'lucide-react';
import { MOCK_REMATE, type MockLote } from '../previewConsola/mockData';
import { YouTubeMark } from '../../../features/rematador/components/YouTubeMark';
import { LiveDot } from '../previewInicio/shared';
import { QuietMeter, hhmm, peso, pesoCorto, duration, type Tone } from './charts';
import type { EmpresaSim, PanelAlert } from './sim';

/* -------------------------------------------------------------------- estructura */

/** Título de sección con una sola línea de ayuda: dice qué mirar, no decora. */
export function SectionHead({
  title,
  hint,
  aside,
  tone = 'light',
}: {
  title: string;
  hint?: string;
  aside?: ReactNode;
  tone?: Tone;
}) {
  const dark = tone === 'dark';
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
      <div className="min-w-0">
        <h2 className={clsx('text-lg font-semibold tracking-tight', dark ? 'text-white' : 'text-ink')}>{title}</h2>
        {hint && <p className={clsx('mt-0.5 max-w-xl text-sm', dark ? 'text-white/60' : 'text-ink-muted')}>{hint}</p>}
      </div>
      {aside}
    </div>
  );
}

export function StatusPill({ sim, onDark = false }: { sim: EmpresaSim; onDark?: boolean }) {
  if (sim.state === 'paused') {
    return (
      <span className={clsx('inline-flex items-center gap-1.5 text-sm font-semibold', onDark ? 'text-warning-300' : 'text-warning-700')}>
        <span className="h-2 w-2 rounded-full bg-warning-500" aria-hidden="true" /> En pausa
      </span>
    );
  }
  if (sim.state === 'finished') {
    return (
      <span className={clsx('inline-flex items-center gap-1.5 text-sm font-semibold', onDark ? 'text-white/70' : 'text-ink-muted')}>
        <span className="h-2 w-2 rounded-full bg-ink-faint" aria-hidden="true" /> Finalizado
      </span>
    );
  }
  return (
    <span className={clsx('inline-flex items-center gap-2 text-sm font-semibold', onDark ? 'text-success-300' : 'text-success-700')}>
      <LiveDot /> En vivo
    </span>
  );
}

/** Quién está operando el remate: lo primero que la empresa necesita saber que está en pie. */
export function OperatorChip({ sim, onDark = false }: { sim: EmpresaSim; onDark?: boolean }) {
  const ok = sim.operatorOnline;
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-medium',
        ok
          ? onDark
            ? 'border-white/20 text-white/85'
            : 'border-line-strong text-ink'
          : onDark
            ? 'border-danger-300/60 bg-danger-500/20 text-danger-200'
            : 'border-danger-200 bg-danger-50 text-danger-700',
      )}
    >
      <span className={clsx('h-2 w-2 rounded-full', ok ? 'bg-success-500' : 'bg-danger-500')} aria-hidden="true" />
      {ok ? 'Martillero conectado' : 'Sin martillero'}
    </span>
  );
}

/* ----------------------------------------------------------------------- precio */

/** El precio líder: cuando cambia, se acomoda con un pequeño relevo vertical (solo eso). */
export function LeaderPrice({ amount, className = '' }: { amount: number | null; className?: string }) {
  return (
    <span className={clsx('relative inline-block overflow-hidden align-bottom tabular-nums', className)}>
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={amount ?? 'none'}
          className="inline-block"
          initial={{ y: '40%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: '-40%', opacity: 0 }}
          transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
        >
          {amount === null ? '—' : peso(amount)}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/* ------------------------------------------------------------------------ avisos */

const ALERT_STYLE: Record<PanelAlert['level'], { box: string; icon: ReactNode; label: string }> = {
  critical: { box: 'border-danger-200 bg-danger-50 text-danger-800', icon: <ShieldAlert className="h-4 w-4" aria-hidden="true" />, label: 'Urgente' },
  warning: { box: 'border-warning-200 bg-warning-50 text-warning-800', icon: <AlertTriangle className="h-4 w-4" aria-hidden="true" />, label: 'Atención' },
  info: { box: 'border-line bg-surface-subtle text-ink', icon: <Info className="h-4 w-4 text-ink-faint" aria-hidden="true" />, label: 'Pendiente' },
};

/** Lista de lo que pide atención. Vacía no ocupa lugar: dice "todo en orden" en una línea. */
export function AlertList({ alerts, compact = false }: { alerts: PanelAlert[]; compact?: boolean }) {
  if (alerts.length === 0) {
    return (
      <p className="flex items-center gap-2 text-sm text-success-700">
        <Check className="h-4 w-4" aria-hidden="true" /> Todo en orden: hay martillero, el remate corre y no hay nada pendiente.
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-2" aria-label="Avisos del remate">
      {alerts.map((alert) => {
        const s = ALERT_STYLE[alert.level];
        return (
          <li key={alert.id} className={clsx('flex items-start gap-3 rounded-xl border px-3.5 py-3', s.box)}>
            <span className="mt-0.5 shrink-0">{s.icon}</span>
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-snug">{alert.title}</p>
              {!compact && <p className="mt-0.5 text-sm opacity-80">{alert.detail}</p>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/* ----------------------------------------------------------------- lote en remate */

export function LotePhoto({ lote, className = '' }: { lote: MockLote; className?: string }) {
  return (
    <div className={clsx('relative overflow-hidden rounded-2xl bg-ink', className)}>
      <img src={lote.images[0]} alt={lote.title} className="absolute inset-0 h-full w-full object-cover" />
    </div>
  );
}

/** Cuánto sobre el precio base va el líder, en una línea. */
export function overBase(amount: number, base: number): string {
  const pct = ((amount - base) / base) * 100;
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(0)} % sobre la base`;
}

export function ActiveFacts({ sim, tone = 'light' }: { sim: EmpresaSim; tone?: Tone }) {
  const dark = tone === 'dark';
  const lote = sim.active;
  if (!lote) return null;
  const lead = sim.winning?.amount ?? null;
  const loteOffers = sim.offers.length;
  const rows: [string, string][] = [
    ['Precio base', peso(lote.basePrice)],
    ['Incremento mínimo', peso(lote.minIncrement)],
    ['Ofertas en este lote', String(loteOffers)],
    ['Sobre la base', lead ? overBase(lead, lote.basePrice).replace(' sobre la base', '') : '—'],
  ];
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt className={clsx('text-xs', dark ? 'text-white/55' : 'text-ink-faint')}>{label}</dt>
          <dd className={clsx('text-sm font-semibold tabular-nums', dark ? 'text-white' : 'text-ink')}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export { QuietMeter };

/* ------------------------------------------------------------------------ colas */

export function UpcomingList({ sim, limit = 5 }: { sim: EmpresaSim; limit?: number }) {
  const list = sim.upcoming.slice(0, limit);
  if (sim.upcoming.length === 0) return <p className="text-sm text-ink-muted">No quedan lotes en cola.</p>;
  return (
    <div>
      <ul className="divide-y divide-line">
        {list.map((lote, i) => (
          <li key={lote.id} className="flex items-center gap-3 py-2.5">
            <span className="w-14 shrink-0 text-xs text-ink-faint tabular-nums">{i === 0 ? 'Sigue' : `Lote ${lote.number}`}</span>
            <img src={lote.images[0]} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
            <span className="min-w-0 flex-1">
              <span className="line-clamp-1 text-sm font-medium text-ink">
                {i === 0 && <span className="text-ink-faint">Lote {lote.number} · </span>}
                {lote.title}
              </span>
            </span>
            <span className="shrink-0 font-mono text-sm text-ink-muted tabular-nums">{pesoCorto(lote.basePrice)}</span>
          </li>
        ))}
      </ul>
      {sim.upcoming.length > limit && <p className="pt-2 text-xs text-ink-faint">y {sim.upcoming.length - limit} más en cola · {pesoCorto(sim.queueBase)} a precio base en total</p>}
    </div>
  );
}

export function DesiertosList({ sim }: { sim: EmpresaSim }) {
  const [custom, setCustom] = useState<string | null>(null);
  const [price, setPrice] = useState('');
  if (sim.desiertos.length === 0) {
    return <p className="text-sm text-ink-muted">Ningún lote quedó desierto.</p>;
  }
  return (
    <ul className="divide-y divide-line">
      {sim.desiertos.map((lote) => (
        <li key={lote.id} className="py-3">
          <div className="flex items-start gap-3">
            <img src={lote.images[0]} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover grayscale" />
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-sm font-medium text-ink">
                <span className="text-ink-faint">Lote {lote.number} · </span>
                {lote.title}
              </p>
              <p className="mt-0.5 text-xs text-ink-faint">Salió desde {pesoCorto(lote.basePrice)} y no recibió ofertas.</p>
            </div>
            <button
              type="button"
              onClick={() => (lote.requeuePreset ? sim.requeue(lote) : setCustom(custom === lote.id ? null : lote.id))}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-line-strong px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:bg-surface-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 active:scale-[0.97]"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              {lote.requeuePreset ? `Volver a rematar · ${pesoCorto(lote.requeuePreset)}` : 'Elegir precio'}
            </button>
          </div>
          {custom === lote.id && (
            <form
              className="mt-3 flex items-end gap-3 pl-[3.75rem]"
              onSubmit={(e) => {
                e.preventDefault();
                sim.requeue({ ...lote, requeuePreset: Number(price) || lote.basePrice });
                setCustom(null);
                setPrice('');
              }}
            >
              <label className="flex-1 text-xs text-ink-faint">
                Nuevo precio base
                <input
                  value={price}
                  onChange={(e) => setPrice(e.target.value.replace(/\D/g, ''))}
                  inputMode="numeric"
                  placeholder={String(lote.basePrice)}
                  className="mt-1 w-full border-b-2 border-line-strong bg-transparent py-1.5 text-sm text-ink outline-none focus:border-ink"
                />
              </label>
              <button type="submit" className="rounded-full bg-ink px-4 py-2 text-xs font-semibold text-white hover:bg-ink/85">
                Volver a rematar
              </button>
            </form>
          )}
        </li>
      ))}
    </ul>
  );
}

/* ---------------------------------------------------------------- resultados */

/** Cómo salió cada lote contra su precio base: la barra mide cuánto subió. */
export function ResultsTable({ sim }: { sim: EmpresaSim }) {
  const rows = [
    ...sim.sold.map((r) => ({ kind: 'sold' as const, ...r })),
    ...sim.unsold.map((r) => ({ kind: 'unsold' as const, ...r })),
  ].sort((a, b) => a.number - b.number);
  const maxUp = Math.max(...sim.sold.map((r) => ((r.final - r.base) / r.base) * 100), 1);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[34rem] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-line text-xs text-ink-faint">
            <th scope="col" className="py-2 pr-3 font-medium">Lote</th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">Base</th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">Final</th>
            <th scope="col" className="w-[34%] py-2 pr-3 font-medium">Sobre la base</th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">Ofertas</th>
            <th scope="col" className="py-2 text-right font-medium">Duró</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((row) => {
            if (row.kind === 'unsold') {
              return (
                <tr key={row.number} className="text-ink-muted">
                  <td className="py-2.5 pr-3">
                    <span className="block max-w-[16rem] truncate"><span className="text-ink-faint">{row.number} · </span>{row.title}</span>
                  </td>
                  <td className="py-2.5 pr-3 text-right font-mono tabular-nums">{pesoCorto(row.base)}</td>
                  <td className="py-2.5 pr-3 text-right">—</td>
                  <td className="py-2.5 pr-3 text-xs font-medium text-danger-700">Desierto, sin ofertas</td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">0</td>
                  <td className="py-2.5 text-right tabular-nums">{duration(row.closedAt - row.openedAt)}</td>
                </tr>
              );
            }
            const up = ((row.final - row.base) / row.base) * 100;
            return (
              <tr key={row.number}>
                <td className="py-2.5 pr-3 text-ink">
                  <span className="block max-w-[16rem] truncate"><span className="text-ink-faint">{row.number} · </span>{row.title}</span>
                </td>
                <td className="py-2.5 pr-3 text-right font-mono tabular-nums text-ink-muted">{pesoCorto(row.base)}</td>
                <td className="py-2.5 pr-3 text-right font-mono font-semibold tabular-nums text-ink">{pesoCorto(row.final)}</td>
                <td className="py-2.5 pr-3">
                  <span className="flex items-center gap-2">
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
                      <span className="block h-full rounded-full bg-brand-500" style={{ width: `${Math.max(4, (up / maxUp) * 100)}%` }} />
                    </span>
                    <span className="w-12 text-right text-xs font-semibold tabular-nums text-ink">+{up.toFixed(0)} %</span>
                  </span>
                </td>
                <td className="py-2.5 pr-3 text-right tabular-nums text-ink-muted">{row.offers}</td>
                <td className="py-2.5 text-right tabular-nums text-ink-muted">{duration(row.closedAt - row.openedAt)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------ línea de tiempo */

export function EventFeed({ sim, limit = 7 }: { sim: EmpresaSim; limit?: number }) {
  const list = [...sim.events].sort((a, b) => b.at - a.at).slice(0, limit);
  const dot = { sold: 'bg-success-500', opened: 'bg-warning-500', unsold: 'bg-ink-faint' } as const;
  const label = { sold: 'vendido', opened: 'abrió', unsold: 'desierto' } as const;
  return (
    <ol className="divide-y divide-line" aria-label="Últimos movimientos">
      {list.map((e) => (
        <li key={e.id} className="flex items-baseline gap-3 py-2.5 text-sm">
          <span className="w-11 shrink-0 text-xs text-ink-faint tabular-nums">{hhmm(e.at)}</span>
          <span aria-hidden="true" className={clsx('h-2 w-2 shrink-0 translate-y-[-1px] rounded-full', dot[e.kind])} />
          <span className="min-w-0 flex-1 text-ink">
            Lote {e.number} <span className="text-ink-muted">{label[e.kind]}</span>
          </span>
          {e.price && <span className="font-mono text-sm font-semibold tabular-nums text-ink">{pesoCorto(e.price)}</span>}
        </li>
      ))}
    </ol>
  );
}

/* --------------------------------------------------------------- accesos / equipo */

function CopyField({ label, value }: { label: string; value: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="flex items-end justify-between gap-3 border-b border-line pb-2">
      <div className="min-w-0">
        <p className="text-xs text-ink-faint">{label}</p>
        <p className="truncate font-mono text-sm font-semibold text-ink">{value}</p>
      </div>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard?.writeText(value).catch(() => undefined);
          setDone(true);
          window.setTimeout(() => setDone(false), 1600);
        }}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-line-strong px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:bg-surface-subtle active:scale-[0.97]"
      >
        {done ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
        {done ? 'Copiado' : 'Copiar'}
      </button>
    </div>
  );
}

/** Martillero, transmisión y acceso privado: lo que la empresa configura una vez y consulta si algo falla. */
export function AccessGrid({ sim }: { sim: EmpresaSim }) {
  const [url, setUrl] = useState(sim.streamOn ? 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' : '');
  return (
    <div className="grid gap-x-12 gap-y-10 lg:grid-cols-3">
      <section aria-label="Martillero">
        <h3 className="text-base font-semibold tracking-tight text-ink">Martillero</h3>
        <p className="mt-1 flex items-center gap-2 text-sm text-ink-muted">
          <span className={clsx('h-2 w-2 rounded-full', sim.operatorOnline ? 'bg-success-500' : 'bg-danger-500')} aria-hidden="true" />
          {sim.operatorOnline ? 'Está conectado y operando.' : 'Todavía no se conectó nadie.'}
        </p>
        <div className="mt-4 flex flex-col gap-4">
          <CopyField label="ID del remate" value={MOCK_REMATE.remateId} />
          <CopyField label="Código de operador" value={MOCK_REMATE.operatorId} />
        </div>
        <p className="mt-3 text-xs text-ink-faint">Si generás un código nuevo, el martillero actual pierde el acceso.</p>
      </section>

      <section aria-label="Transmisión">
        <h3 className="flex items-center gap-2 text-base font-semibold tracking-tight text-ink">
          <YouTubeMark size={18} /> Transmisión
        </h3>
        <p className="mt-1 flex items-center gap-2 text-sm text-ink-muted">
          <span className={clsx('h-2 w-2 rounded-full', url ? 'bg-success-500' : 'bg-ink-faint')} aria-hidden="true" />
          {url ? 'Los compradores ven el video en la sala.' : 'Sin video: la sala muestra solo las fotos del lote.'}
        </p>
        <label className="mt-4 block text-xs text-ink-faint" htmlFor="pe-stream">
          Link de YouTube
        </label>
        <input
          id="pe-stream"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.youtube.com/watch?v=…"
          className="mt-1 w-full border-b-2 border-line-strong bg-transparent py-2 text-sm text-ink outline-none focus:border-ink"
        />
        <button type="button" className="mt-4 rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white transition-transform hover:bg-ink/85 active:scale-[0.97]">
          Guardar link
        </button>
      </section>

      <section aria-label="Acceso privado">
        <h3 className="flex items-center gap-2 text-base font-semibold tracking-tight text-ink">
          <KeyRound className="h-4 w-4" aria-hidden="true" /> Acceso de compradores
        </h3>
        <p className="mt-1 text-sm text-ink-muted">Remate privado: solo entra quien tenga este código.</p>
        <div className="mt-4">
          <CopyField label="Código de ingreso" value="REM-48K2-QP7X" />
        </div>
        <p className="mt-3 text-xs text-ink-faint">Compartilo solo con los compradores invitados.</p>
      </section>
    </div>
  );
}

/* -------------------------------------------------------------------- selector */

export function EmpresaSwitch({ current, onReset }: { current: 'a' | 'b'; onReset: () => void }) {
  const base = 'rounded-full px-4 py-2 text-sm font-medium transition-colors';
  return (
    <div className="fixed bottom-4 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-1 rounded-full bg-ink p-1 shadow-xl ring-1 ring-white/20">
      <Link to="/preview-empresa-a" className={`${base} ${current === 'a' ? 'bg-white text-ink' : 'text-white/70 hover:text-white'}`}>
        Opción A · Tablero
      </Link>
      <Link to="/preview-empresa-b" className={`${base} ${current === 'b' ? 'bg-white text-ink' : 'text-white/70 hover:text-white'}`}>
        Opción B · Cabina
      </Link>
      <span className="mx-1 h-5 w-px bg-white/20" aria-hidden="true" />
      <button type="button" onClick={onReset} className={`${base} text-white/70 hover:text-white`}>
        Reiniciar
      </button>
    </div>
  );
}
