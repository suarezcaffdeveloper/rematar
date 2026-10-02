import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Bucket, EventKind, LoteCell, SoldRecord, TimelineEvent } from './sim';

/**
 * Gráficos del panel de la empresa, dibujados a mano en SVG (sin librería): marcas finas,
 * extremos redondeados anclados a la base, una sola escala por gráfico, referencias directas
 * en el dibujo y un tooltip al pasar el mouse. Cada uno acepta `tone` para vivir sobre fondo
 * claro u oscuro. El color nunca es lo único que dice algo: todo estado lleva texto.
 */

export type Tone = 'light' | 'dark';

export const INK: Record<Tone, { text: string; muted: string; faint: string; grid: string; surface: string; bar: string; barSoft: string; ok: string; warn: string; bad: string }> = {
  light: { text: '#101114', muted: '#6b6f76', faint: '#a2a5ab', grid: '#e7e7ea', surface: '#ffffff', bar: '#3f64f4', barSoft: '#9db3fa', ok: '#16a34a', warn: '#d97706', bad: '#dc2626' },
  dark: { text: '#ffffff', muted: 'rgba(255,255,255,0.68)', faint: 'rgba(255,255,255,0.42)', grid: 'rgba(255,255,255,0.12)', surface: '#101114', bar: '#6e8bf7', barSoft: 'rgba(110,139,247,0.45)', ok: '#4ade80', warn: '#fbbf24', bad: '#f87171' },
};

/* ------------------------------------------------------------------- formatos */

export const peso = (n: number) => `$ ${Math.round(n).toLocaleString('es-AR')}`;

/** $ 4,1 M / $ 850 mil: para ejes y etiquetas donde no entra el número completo. */
export function pesoCorto(n: number): string {
  if (n >= 1_000_000) return `$ ${(n / 1_000_000).toFixed(n >= 10_000_000 ? 1 : 2).replace('.', ',').replace(/,?0+$/, '')} M`;
  if (n >= 1_000) return `$ ${Math.round(n / 1_000)} mil`;
  return `$ ${Math.round(n)}`;
}

const hm = new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
const hms = new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
export const hhmm = (t: number) => hm.format(new Date(t));
export const hhmmss = (t: number) => hms.format(new Date(t));

export function duration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m >= 60) return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
  return m > 0 ? `${m} min ${String(s).padStart(2, '0')} s` : `${s} s`;
}

export const EVENT_LABEL: Record<EventKind, string> = { opened: 'Abrió', sold: 'Vendido', unsold: 'Desierto' };

/* ------------------------------------------------------------------ utilidades */

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    setWidth(Math.round(el.clientWidth));
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

function niceMax(value: number): number {
  if (value <= 4) return 4;
  const step = value <= 10 ? 2 : value <= 20 ? 5 : 10;
  return Math.ceil(value / step) * step;
}

/** Barra con solo el extremo superior redondeado (el pie queda recto sobre la base). */
function barPath(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h} L${x},${y + rr} Q${x},${y} ${x + rr},${y} L${x + w - rr},${y} Q${x + w},${y} ${x + w},${y + rr} L${x + w},${y + h} Z`;
}

function Tooltip({ tone, x, y, width, children }: { tone: Tone; x: number; y: number; width: number; children: ReactNode }) {
  const flip = x > width * 0.62;
  return (
    <div
      role="status"
      className={`pointer-events-none absolute z-10 w-max max-w-[16rem] rounded-xl px-3 py-2 text-xs shadow-lg ${
        tone === 'dark' ? 'bg-white text-ink' : 'bg-ink text-white'
      }`}
      style={{ left: flip ? undefined : x + 12, right: flip ? width - x + 12 : undefined, top: Math.max(0, y) }}
    >
      {children}
    </div>
  );
}

const EVENT_COLOR = (kind: EventKind, c: (typeof INK)['light']) => (kind === 'sold' ? c.ok : kind === 'opened' ? c.warn : c.faint);

/* ---------------------------------------------------------------- pulso (barras) */

/**
 * Ofertas por minuto, últimos 60 minutos. Cada lote que abre, se vende o queda desierto es
 * una marca vertical: así se lee de un vistazo qué lote movió el remate. La barra del minuto
 * en curso va más clara porque todavía no terminó.
 */
export function PulseChart({
  buckets,
  events,
  tone = 'light',
  height = 232,
}: {
  buckets: Bucket[];
  events: TimelineEvent[];
  tone?: Tone;
  height?: number;
}) {
  const c = INK[tone];
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const m = { l: 30, r: 6, t: 26, b: 24 };
  const innerW = Math.max(0, width - m.l - m.r);
  const innerH = height - m.t - m.b;
  const n = buckets.length;
  const max = niceMax(Math.max(...buckets.map((b) => b.count), 1));
  const step = n > 0 ? innerW / n : 0;
  const barW = Math.max(2, Math.min(12, step - 3));
  const y = (v: number) => m.t + innerH - (v / max) * innerH;
  const first = buckets[0]?.t ?? 0;
  const span = n * 60_000;
  const xTime = (t: number) => m.l + ((t - first) / span) * innerW;
  const avg = buckets.reduce((s, b) => s + b.count, 0) / Math.max(n, 1);
  const visibleEvents = events.filter((e) => e.at >= first);
  const hovered = hover !== null ? buckets[hover] : null;
  const hoveredEvents = hovered ? visibleEvents.filter((e) => e.at >= hovered.t && e.at < hovered.t + 60_000) : [];

  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`Ofertas por minuto en la última hora. Promedio ${avg.toFixed(1)} por minuto.`}
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const i = Math.floor((e.clientX - rect.left - m.l) / step);
            setHover(i >= 0 && i < n ? i : null);
          }}
          onMouseLeave={() => setHover(null)}
        >
          {[0, max / 2, max].map((v) => (
            <g key={v}>
              <line x1={m.l} x2={width - m.r} y1={y(v)} y2={y(v)} stroke={c.grid} strokeWidth={1} />
              <text x={m.l - 8} y={y(v) + 4} textAnchor="end" fontSize={11} fill={c.faint} className="tabular-nums">
                {v}
              </text>
            </g>
          ))}

          {visibleEvents.map((e) => {
            const x = xTime(e.at);
            return (
              <g key={e.id}>
                <line x1={x} x2={x} y1={m.t - 6} y2={m.t + innerH} stroke={EVENT_COLOR(e.kind, c)} strokeWidth={1} strokeDasharray="2 3" opacity={0.9} />
                <circle cx={x} cy={m.t - 12} r={4} fill={EVENT_COLOR(e.kind, c)} stroke={c.surface} strokeWidth={2} />
                <text x={x + 8} y={m.t - 8} fontSize={11} fontWeight={600} fill={c.muted}>
                  L{e.number}
                </text>
              </g>
            );
          })}

          {buckets.map((b, i) => {
            if (b.count === 0) return null;
            const h = (b.count / max) * innerH;
            const x = m.l + i * step + (step - barW) / 2;
            const isLast = i === n - 1;
            return (
              <path
                key={b.t}
                d={barPath(x, y(b.count), barW, h, 3)}
                fill={isLast ? c.barSoft : c.bar}
                opacity={hover === null || hover === i ? 1 : 0.55}
              />
            );
          })}

          <line x1={m.l} x2={width - m.r} y1={y(avg)} y2={y(avg)} stroke={c.text} strokeWidth={1} strokeDasharray="4 4" opacity={0.55} />
          <text x={width - m.r} y={y(avg) - 5} textAnchor="end" fontSize={11} fill={c.muted}>
            promedio {avg.toFixed(1).replace('.', ',')}
          </text>

          {[0, 15, 30, 45, 59].map((i) => {
            const b = buckets[i];
            if (!b) return null;
            const anchor = i === 0 ? 'start' : i === 59 ? 'end' : 'middle';
            return (
              <text key={i} x={m.l + i * step + (i === 59 ? step : i === 0 ? 0 : step / 2)} y={height - 6} textAnchor={anchor} fontSize={11} fill={c.faint} className="tabular-nums">
                {i === 59 ? 'ahora' : hhmm(b.t)}
              </text>
            );
          })}

          {hover !== null && <rect x={m.l + hover * step} y={m.t} width={step} height={innerH} fill={c.text} opacity={0.05} />}
        </svg>
      )}
      {hovered && hover !== null && (
        <Tooltip tone={tone} x={m.l + hover * step + step / 2} y={m.t} width={width}>
          <p className="font-semibold tabular-nums">
            {hhmm(hovered.t)} · {hovered.count} {hovered.count === 1 ? 'oferta' : 'ofertas'}
          </p>
          {hoveredEvents.map((e) => (
            <p key={e.id} className="mt-0.5 opacity-80">
              {EVENT_LABEL[e.kind]} lote {e.number}
              {e.price ? ` · ${pesoCorto(e.price)}` : ''}
            </p>
          ))}
        </Tooltip>
      )}
    </div>
  );
}

/* ------------------------------------------------- escalera de precio del lote */

/**
 * Cómo escaló el precio del lote que está en remate: una línea en escalón (cada oferta
 * pisa a la anterior) sobre el precio base. Se ve enseguida si hay pelea o si el lote se
 * estancó. El último punto, el líder, lleva su monto escrito.
 */
export function PriceLadder({
  offers,
  base,
  now,
  tone = 'light',
  height = 168,
}: {
  offers: { id: number; amount: number; at: number }[];
  base: number;
  now: number;
  tone?: Tone;
  height?: number;
}) {
  const c = INK[tone];
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const points = useMemo(() => [...offers].reverse(), [offers]);
  const m = { l: 56, r: 14, t: 16, b: 22 };
  const innerW = Math.max(0, width - m.l - m.r);
  const innerH = height - m.t - m.b;

  if (points.length === 0) {
    return (
      <div ref={ref} className="flex items-center text-sm" style={{ height: 72, color: c.muted }}>
        Todavía no hay ofertas: el lote sale desde {pesoCorto(base)}.
      </div>
    );
  }

  const t0 = points[0].at - 25_000;
  const t1 = Math.max(now, points[points.length - 1].at) + 8_000;
  const top = Math.max(...points.map((p) => p.amount));
  const lo = base - (top - base) * 0.12;
  const hi = top + (top - base) * 0.08;
  const x = (t: number) => m.l + ((t - t0) / (t1 - t0)) * innerW;
  const y = (v: number) => m.t + innerH - ((v - lo) / (hi - lo || 1)) * innerH;

  let path = `M${x(t0)},${y(base)}`;
  let prev = base;
  points.forEach((p) => {
    path += ` L${x(p.at)},${y(prev)} L${x(p.at)},${y(p.amount)}`;
    prev = p.amount;
  });
  path += ` L${x(t1)},${y(prev)}`;

  const lastPoint = points[points.length - 1];
  const hovered = hover !== null ? points[hover] : null;

  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`Escalera de precio: de ${pesoCorto(base)} a ${pesoCorto(top)} en ${points.length} ofertas.`}
          onMouseLeave={() => setHover(null)}
        >
          <line x1={m.l} x2={width - m.r} y1={y(base)} y2={y(base)} stroke={c.faint} strokeWidth={1} strokeDasharray="4 4" />
          <text x={m.l - 8} y={y(base) + 4} textAnchor="end" fontSize={11} fill={c.muted} className="tabular-nums">
            {pesoCorto(base)}
          </text>
          <text x={m.l - 8} y={y(top) + 4} textAnchor="end" fontSize={11} fill={c.muted} className="tabular-nums">
            {pesoCorto(top)}
          </text>
          <text x={m.l + 4} y={y(base) + 14} fontSize={11} fill={c.faint}>
            precio base
          </text>
          <path d={path} fill="none" stroke={c.bar} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {points.map((p, i) => {
            const isLast = p.id === lastPoint.id;
            return (
              <g key={p.id} onMouseEnter={() => setHover(i)}>
                <circle cx={x(p.at)} cy={y(p.amount)} r={14} fill="transparent" />
                <circle cx={x(p.at)} cy={y(p.amount)} r={isLast ? 5.5 : 4} fill={c.bar} stroke={c.surface} strokeWidth={2} />
              </g>
            );
          })}
          <text x={x(lastPoint.at) - 10} y={y(lastPoint.amount) - 10} textAnchor="end" fontSize={12} fontWeight={700} fill={c.text} className="tabular-nums">
            Líder {pesoCorto(lastPoint.amount)}
          </text>
          <text x={m.l} y={height - 5} fontSize={11} fill={c.faint} className="tabular-nums">
            {hhmm(t0)}
          </text>
          <text x={width - m.r} y={height - 5} textAnchor="end" fontSize={11} fill={c.faint}>
            ahora
          </text>
        </svg>
      )}
      {hovered && (
        <Tooltip tone={tone} x={x(hovered.at)} y={y(hovered.amount) - 4} width={width}>
          <p className="font-semibold tabular-nums">{peso(hovered.amount)}</p>
          <p className="opacity-75 tabular-nums">{hhmmss(hovered.at)}</p>
        </Tooltip>
      )}
    </div>
  );
}

/* ------------------------------------------------------- recaudación acumulada */

/**
 * Lo recaudado hasta ahora, escalón por escalón: cada salto es un lote adjudicado. A la
 * derecha, una línea punteada proyecta el piso del remate si lo que queda en cola cierra
 * en su precio base (no promete nada: es el mínimo razonable).
 */
export function RevenueChart({
  sold,
  startAt,
  now,
  etaAt,
  floorExtra,
  tone = 'light',
  height = 220,
}: {
  sold: SoldRecord[];
  startAt: number;
  now: number;
  etaAt: number;
  floorExtra: number;
  tone?: Tone;
  height?: number;
}) {
  const c = INK[tone];
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const ordered = useMemo(() => [...sold].sort((a, b) => a.closedAt - b.closedAt), [sold]);
  const m = { l: 56, r: 16, t: 20, b: 24 };
  const innerW = Math.max(0, width - m.l - m.r);
  const innerH = height - m.t - m.b;
  const total = ordered.reduce((s, r) => s + r.final, 0);
  const floor = total + floorExtra;
  const max = floor * 1.06 || 1;
  const x = (t: number) => m.l + ((t - startAt) / (etaAt - startAt)) * innerW;
  const y = (v: number) => m.t + innerH - (v / max) * innerH;

  let line = `M${x(startAt)},${y(0)}`;
  let acc = 0;
  ordered.forEach((r) => {
    line += ` L${x(r.closedAt)},${y(acc)}`;
    acc += r.final;
    line += ` L${x(r.closedAt)},${y(acc)}`;
  });
  line += ` L${x(now)},${y(acc)}`;
  const area = `${line} L${x(now)},${y(0)} Z`;

  const hovered = hover !== null ? ordered[hover] : null;
  let cumulativeAtHover = 0;
  if (hover !== null) cumulativeAtHover = ordered.slice(0, hover + 1).reduce((s, r) => s + r.final, 0);

  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={`Recaudado ${pesoCorto(total)}; piso proyectado ${pesoCorto(floor)}.`} onMouseLeave={() => setHover(null)}>
          {[0, 0.5, 1].map((f) => (
            <g key={f}>
              <line x1={m.l} x2={width - m.r} y1={y(max * f)} y2={y(max * f)} stroke={c.grid} strokeWidth={1} />
              {f > 0 && (
                <text x={m.l - 8} y={y(max * f) + 4} textAnchor="end" fontSize={11} fill={c.faint} className="tabular-nums">
                  {pesoCorto(max * f)}
                </text>
              )}
            </g>
          ))}
          <line x1={x(now)} x2={x(now)} y1={m.t} y2={y(0)} stroke={c.faint} strokeWidth={1} strokeDasharray="2 3" />
          <path d={area} fill={c.bar} opacity={0.1} />
          <path d={line} fill="none" stroke={c.bar} strokeWidth={2} strokeLinejoin="round" />
          <path d={`M${x(now)},${y(total)} L${x(etaAt)},${y(floor)}`} fill="none" stroke={c.bar} strokeWidth={2} strokeDasharray="5 5" opacity={0.6} />
          <circle cx={x(etaAt)} cy={y(floor)} r={4.5} fill={c.surface} stroke={c.bar} strokeWidth={2} />
          <text x={x(etaAt) - 10} y={y(floor) - 10} textAnchor="end" fontSize={12} fontWeight={700} fill={c.text} className="tabular-nums">
            Piso {pesoCorto(floor)}
          </text>
          <text x={x(now) - 8} y={y(total) - 12} textAnchor="end" fontSize={12} fontWeight={700} fill={c.text} className="tabular-nums">
            Hoy {pesoCorto(total)}
          </text>
          {ordered.map((r, i) => (
            <g key={r.number} onMouseEnter={() => setHover(i)}>
              <circle cx={x(r.closedAt)} cy={y(ordered.slice(0, i + 1).reduce((s, q) => s + q.final, 0))} r={14} fill="transparent" />
              <circle cx={x(r.closedAt)} cy={y(ordered.slice(0, i + 1).reduce((s, q) => s + q.final, 0))} r={4} fill={c.bar} stroke={c.surface} strokeWidth={2} />
            </g>
          ))}
          <text x={m.l} y={height - 6} fontSize={11} fill={c.faint} className="tabular-nums">
            {hhmm(startAt)}
          </text>
          <text x={x(now)} y={height - 6} textAnchor="middle" fontSize={11} fill={c.muted}>
            ahora
          </text>
          <text x={width - m.r} y={height - 6} textAnchor="end" fontSize={11} fill={c.faint} className="tabular-nums">
            cierre est. {hhmm(etaAt)}
          </text>
        </svg>
      )}
      {hovered && hover !== null && (
        <Tooltip tone={tone} x={x(hovered.closedAt)} y={y(cumulativeAtHover) - 6} width={width}>
          <p className="font-semibold">Lote {hovered.number} vendido</p>
          <p className="tabular-nums opacity-80">
            {peso(hovered.final)} · acumulado {pesoCorto(cumulativeAtHover)}
          </p>
        </Tooltip>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- mapa de lotes */

export const CELL_LABEL: Record<LoteCell['status'], string> = {
  sold: 'Vendido',
  open: 'En remate',
  pending: 'En cola',
  unsold: 'Desierto',
};

/**
 * Un casillero por lote, en el orden del catálogo: se lee en un segundo cuánto se vendió,
 * cuál está en remate y cuánto falta. Cada estado lleva su nombre en la leyenda y el
 * desierto además va con borde punteado, no solo con color.
 */
export function LoteStrip({ cells, tone = 'light' }: { cells: LoteCell[]; tone?: Tone }) {
  const dark = tone === 'dark';
  const cls: Record<LoteCell['status'], string> = {
    sold: dark ? 'bg-success-400 text-ink' : 'bg-success-500 text-white',
    open: dark ? 'bg-warning-400 text-ink ring-2 ring-warning-400/40 ring-offset-2 ring-offset-ink' : 'bg-warning-500 text-white ring-2 ring-warning-500/30 ring-offset-2',
    pending: dark ? 'border border-white/25 text-white/70' : 'border border-line-strong text-ink-muted',
    unsold: dark ? 'border border-dashed border-danger-300 text-danger-300' : 'border border-dashed border-danger-300 bg-danger-50 text-danger-700',
  };
  const counts = (['sold', 'open', 'pending', 'unsold'] as const).map((s) => ({ s, n: cells.filter((cell) => cell.status === s).length }));
  return (
    <div>
      <ul className="flex flex-wrap gap-2" aria-label="Mapa de lotes">
        {cells.map((cell) => (
          <li
            key={cell.number}
            title={`Lote ${cell.number} · ${CELL_LABEL[cell.status]}${cell.final ? ` · ${peso(cell.final)}` : ''}\n${cell.title}`}
            className={`flex h-10 min-w-10 items-center justify-center rounded-lg px-2 text-sm font-semibold tabular-nums ${cls[cell.status]}`}
          >
            {cell.number}
          </li>
        ))}
      </ul>
      <ul className={`mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs ${dark ? 'text-white/65' : 'text-ink-muted'}`}>
        {counts.map(({ s, n }) => (
          <li key={s} className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-sm ${cls[s].split(' ').filter((k) => k.startsWith('bg-') || k.startsWith('border')).join(' ') || ''}`} />
            {CELL_LABEL[s]} <span className="font-semibold tabular-nums">{n}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* -------------------------------------------------------------- barra segmentada */

export function SegBar({
  parts,
  tone = 'light',
}: {
  parts: { label: string; value: number; color: string }[];
  tone?: Tone;
}) {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  return (
    <div>
      <div className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full" role="img" aria-label={parts.map((p) => `${p.label} ${p.value}`).join(', ')}>
        {parts.map((p) =>
          p.value > 0 ? <span key={p.label} className="h-full first:rounded-l-full last:rounded-r-full" style={{ width: `${(p.value / total) * 100}%`, background: p.color }} /> : null,
        )}
      </div>
      <ul className={`mt-2.5 flex flex-wrap gap-x-5 gap-y-1 text-xs ${tone === 'dark' ? 'text-white/65' : 'text-ink-muted'}`}>
        {parts.map((p) => (
          <li key={p.label} className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm" style={{ background: p.color }} />
            {p.label} <span className="font-semibold tabular-nums">{p.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* -------------------------------------------------------------------- sparkline */

export function Sparkline({ values, tone = 'light', height = 36, width = 120 }: { values: number[]; tone?: Tone; height?: number; width?: number }) {
  const c = INK[tone];
  if (values.length < 2) return null;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const x = (i: number) => (i / (values.length - 1)) * (width - 6) + 3;
  const y = (v: number) => height - 4 - ((v - lo) / (hi - lo || 1)) * (height - 10);
  const d = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(v)}`).join(' ');
  return (
    <svg width={width} height={height} aria-hidden="true">
      <path d={d} fill="none" stroke={c.bar} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(values.length - 1)} cy={y(values[values.length - 1])} r={3} fill={c.bar} stroke={c.surface} strokeWidth={1.5} />
    </svg>
  );
}

/* ------------------------------------------------------------ medidor de quietud */

/** Segundos sin ofertas nuevas en el lote en remate: 0–30 s normal, 30–60 s atención, +60 s alerta. */
export function QuietMeter({ seconds, tone = 'light' }: { seconds: number | null; tone?: Tone }) {
  const dark = tone === 'dark';
  const s = seconds ?? 0;
  const pct = Math.min(s / 90, 1) * 100;
  const level = s >= 60 ? 'alta' : s >= 30 ? 'media' : 'normal';
  const fill = level === 'alta' ? (dark ? '#f87171' : '#dc2626') : level === 'media' ? (dark ? '#fbbf24' : '#d97706') : dark ? '#4ade80' : '#16a34a';
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className={`text-xs ${dark ? 'text-white/60' : 'text-ink-faint'}`}>Última oferta</span>
        <span className={`text-sm font-semibold tabular-nums ${dark ? 'text-white' : 'text-ink'}`}>
          {seconds === null ? 'sin ofertas' : `hace ${s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`}`}
        </span>
      </div>
      <div className={`relative mt-2 h-1.5 rounded-full ${dark ? 'bg-white/15' : 'bg-line'}`} role="img" aria-label={`Quietud ${level}`}>
        <span className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-700 ease-out" style={{ width: `${pct}%`, background: fill }} />
        <span aria-hidden="true" className={`absolute -top-0.5 h-2.5 w-px ${dark ? 'bg-white/40' : 'bg-line-strong'}`} style={{ left: '33.3%' }} />
        <span aria-hidden="true" className={`absolute -top-0.5 h-2.5 w-px ${dark ? 'bg-white/40' : 'bg-line-strong'}`} style={{ left: '66.6%' }} />
      </div>
      <div className={`mt-1.5 flex justify-between text-[11px] ${dark ? 'text-white/40' : 'text-ink-faint'}`}>
        <span>0 s</span>
        <span>30 s</span>
        <span>60 s</span>
        <span>90 s +</span>
      </div>
    </div>
  );
}
