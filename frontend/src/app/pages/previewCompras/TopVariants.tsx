import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import type { PostAuctionCaseDetail, PostAuctionStatus } from '../../../features/postauction/types';
import {
  COMPRAS_GROUPS,
  CompraThumb,
  STATUS_LABELS,
  groupOf,
  money,
  nextStep,
  statusTone,
  timeAgo,
  type ComprasGroupId,
} from './shared';

const DONE: PostAuctionStatus[] = ['entregado', 'finalizado'];

/** Qué compra va al frente: primero la que espera el pago del comprador, después la que
 * espera contacto, después la recién adjudicada; dentro de cada una, la que hace más que
 * espera. */
const FOCUS_ORDER: PostAuctionStatus[] = ['pago_pendiente', 'pendiente_contacto', 'adjudicado'];

const FOCUS_LABELS: Partial<Record<PostAuctionStatus, string>> = {
  pago_pendiente: 'Esperando tu pago',
  pendiente_contacto: 'Esperando al martillero',
  adjudicado: 'Recién adjudicada',
};

export interface TopVariantProps {
  compras: PostAuctionCaseDetail[];
  group: ComprasGroupId | 'all';
  onGroup: (group: ComprasGroupId | 'all') => void;
}

function Intro({ children }: { children: string }) {
  return (
    <header className="mb-8 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
      <h1 className="text-balance text-4xl font-semibold leading-[1.02] tracking-tight sm:text-6xl">Mis compras</h1>
      <p className="max-w-sm text-ink-muted">{children}</p>
    </header>
  );
}

/* --------------------------------------------------------- opción 1: próximo paso */

/**
 * Arriba de todo, la compra que más te necesita, en grande y con su foto: qué está
 * pasando, qué sigue y el botón para seguirla. A un costado, las otras compras que
 * también están en marcha. Reemplaza al titular con contador y a las tres cifras.
 */
export function TopFocus({ compras }: TopVariantProps) {
  const inProgress = compras.filter((c) => !DONE.includes(c.status));
  const rank = (c: PostAuctionCaseDetail) => {
    const i = FOCUS_ORDER.indexOf(c.status);
    return i === -1 ? FOCUS_ORDER.length : i;
  };
  const sorted = [...inProgress].sort(
    (a, b) => rank(a) - rank(b) || new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
  const focus = sorted[0];
  const others = sorted.slice(1, 5);

  if (!focus) {
    return <Intro>Todavía no tenés compras en marcha. Cuando ganes un lote, lo seguís desde acá.</Intro>;
  }

  return (
    <>
      <Intro>Seguí cada lote que ganaste, desde la adjudicación hasta que lo tenés en tus manos.</Intro>

      <div className="grid gap-3 lg:h-[26rem] lg:grid-cols-[minmax(0,1fr)_23rem]">
        <section
          aria-label="Tu próximo paso"
          className="relative min-h-[26rem] overflow-hidden rounded-2xl bg-ink text-white"
        >
          <CompraThumb compra={focus} className="absolute inset-0 h-full w-full" />
          <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/60 to-ink/10" />
          <div className="absolute inset-0 bg-gradient-to-r from-ink/70 via-transparent to-transparent" />

          <div className="absolute inset-x-0 bottom-0 flex flex-col gap-4 p-6 sm:p-10">
            <p className="flex items-center gap-2.5 text-sm font-medium text-white/90">
              <span className="relative inline-flex h-2 w-2" aria-hidden="true">
                <span className="absolute inset-0 animate-ping rounded-full bg-warning-400 opacity-75" />
                <span className="relative h-2 w-2 rounded-full bg-warning-400" />
              </span>
              {FOCUS_LABELS[focus.status] ?? STATUS_LABELS[focus.status]}
            </p>
            <h2 className="max-w-3xl text-balance text-3xl font-semibold leading-[1.05] tracking-tight sm:text-5xl">
              {focus.lote_title}
            </h2>
            <p className="text-sm text-white/70">
              Lote {focus.lot_number} del remate {focus.remate_title}, adjudicado {timeAgo(focus.created_at)}
            </p>
            <p className="max-w-xl text-base leading-relaxed text-white/85">{nextStep(focus)}</p>
            <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
              <p className="text-4xl font-semibold tabular-nums tracking-tight">{money(focus.final_price)}</p>
              <a
                href="#"
                onClick={(e) => e.preventDefault()}
                className="group inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-base font-semibold text-ink transition-colors hover:bg-brand-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-ink"
              >
                Ver compra
                <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" aria-hidden="true" />
              </a>
            </div>
          </div>
        </section>

        <aside aria-label="Otras compras en marcha" className="flex flex-col rounded-2xl border border-line p-6">
          <h2 className="text-lg font-semibold tracking-tight">También en marcha</h2>
          <p className="mt-0.5 text-sm text-ink-muted">
            {others.length === 0
              ? 'No hay otras compras en proceso.'
              : `${inProgress.length - 1} ${inProgress.length - 1 === 1 ? 'compra más' : 'compras más'} en proceso`}
          </p>
          <ul className="mt-4 flex flex-1 flex-col divide-y divide-line">
            {others.map((c) => (
              <li key={c.id}>
                <a
                  href="#"
                  onClick={(e) => e.preventDefault()}
                  className="group flex items-center gap-3 rounded-lg py-3 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                >
                  <CompraThumb compra={c} className="h-12 w-12 shrink-0 rounded-lg" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium leading-snug">{c.lote_title}</span>
                    <span className={`block text-xs font-medium ${statusTone(c.status)}`}>
                      {STATUS_LABELS[c.status]}
                    </span>
                  </span>
                  <ArrowUpRight
                    className="h-4 w-4 shrink-0 text-ink-faint transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-brand-600"
                    aria-hidden="true"
                  />
                </a>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </>
  );
}

/* ------------------------------------------------------------ opción 2: panorama */

const SEGMENT_STYLES: Record<ComprasGroupId, { base: string; muted: string }> = {
  coordinar: { base: 'bg-surface-subtle text-ink border border-line', muted: 'text-ink-muted' },
  pagar: { base: 'bg-brand-600 text-white', muted: 'text-brand-100' },
  camino: { base: 'bg-brand-50 text-brand-800', muted: 'text-brand-700' },
  recibidas: { base: 'bg-ink text-white', muted: 'text-white/65' },
};

const EVENT_FIELDS: { key: keyof PostAuctionCaseDetail; text: string }[] = [
  { key: 'delivered_at', text: 'se entregó' },
  { key: 'shipped_at', text: 'fue enviada' },
  { key: 'payment_at', text: 'se registró el pago' },
  { key: 'contacted_at', text: 'el martillero se contactó' },
  { key: 'created_at', text: 'te la adjudicaron' },
];

function latestEvent(compra: PostAuctionCaseDetail): { at: string; text: string } {
  for (const field of EVENT_FIELDS) {
    const value = compra[field.key] as string | null;
    if (value) return { at: value, text: field.text };
  }
  return { at: compra.created_at, text: 'te la adjudicaron' };
}

/**
 * El estado de todas tus compras de un vistazo: una barra dividida en las cuatro etapas,
 * con el ancho de cada tramo proporcional a cuántas compras hay (y clickeable: filtra la
 * lista de abajo), más las últimas novedades ordenadas por fecha. Reemplaza al titular con
 * contador y a las tres cifras.
 */
export function TopPanorama({ compras, group, onGroup }: TopVariantProps) {
  const reduceMotion = useReducedMotion();
  const events = compras
    .map((c) => ({ compra: c, ...latestEvent(c) }))
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 4);

  return (
    <>
      <Intro>Seguí cada lote que ganaste, desde la adjudicación hasta que lo tenés en tus manos.</Intro>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_24rem] lg:gap-14">
        <section aria-label="Compras por etapa">
          <div className="flex h-56 gap-2 sm:h-64">
            {COMPRAS_GROUPS.map((g, i) => {
              const items = compras.filter((c) => groupOf(c.status) === g.id);
              const total = items.reduce((sum, c) => sum + Number(c.final_price), 0);
              const style = SEGMENT_STYLES[g.id];
              const selected = group === g.id;
              return (
                <motion.button
                  key={g.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onGroup(selected ? 'all' : g.id)}
                  disabled={items.length === 0}
                  initial={reduceMotion ? false : { flexGrow: 0.0001, opacity: 0 }}
                  animate={{ flexGrow: Math.max(items.length, 0.6), opacity: 1 }}
                  transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1], delay: 0.08 * i }}
                  style={{ flexBasis: 0 }}
                  className={`relative flex min-w-0 flex-col justify-between overflow-hidden rounded-2xl p-4 text-left transition-shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-default disabled:opacity-50 sm:p-5 ${style.base} ${
                    selected ? 'ring-2 ring-ink ring-offset-2' : 'hover:shadow-lg'
                  }`}
                >
                  <span className="text-5xl font-semibold leading-none tabular-nums tracking-tight sm:text-6xl">
                    {items.length}
                  </span>
                  <span>
                    <span className="block truncate font-semibold">{g.label}</span>
                    <span className={`block truncate text-sm tabular-nums ${style.muted}`}>
                      {items.length === 0 ? 'Nada por acá' : money(total)}
                    </span>
                  </span>
                </motion.button>
              );
            })}
          </div>
          <p className="mt-3 text-sm text-ink-muted">
            Tocá una etapa para ver solo esas compras. El ancho de cada tramo es la cantidad de compras.
          </p>
        </section>

        <section aria-labelledby="novedades-title">
          <h2 id="novedades-title" className="text-lg font-semibold tracking-tight">
            Últimas novedades
          </h2>
          <ul className="mt-3 border-t border-ink">
            {events.map(({ compra, at, text }) => (
              <li key={compra.id} className="border-b border-line">
                <a
                  href="#"
                  onClick={(e) => e.preventDefault()}
                  className="group flex items-start gap-3 py-3.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                >
                  <CompraThumb compra={compra} className="mt-0.5 h-11 w-11 shrink-0 rounded-lg" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium leading-snug transition-transform duration-300 group-hover:translate-x-0.5">
                      {compra.lote_title}
                    </span>
                    <span className="block text-sm text-ink-muted">
                      {text.charAt(0).toUpperCase() + text.slice(1)}, {timeAgo(at)}
                    </span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
