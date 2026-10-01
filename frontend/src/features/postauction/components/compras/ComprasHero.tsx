import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { getStatusCopy } from '../../buyerStatusCopy';
import { FOCUS_LABELS, timeAgo, type CompraEvent } from '../../comprasUtils';
import { STATUS_LABELS } from '../../labels';
import type { PostAuctionCase } from '../../types';
import { formatCurrency } from '../../../../shared/lib/format';
import { CompraCover } from './CompraCover';

const CURRENCY = 'ARS';

export interface ComprasHeroProps {
  focus: PostAuctionCase;
  events: CompraEvent[];
}

/**
 * Arriba de todo, la compra que más te necesita, en grande y con su foto: qué está
 * pasando, qué sigue y el botón para seguirla. A un costado, las últimas novedades de
 * todas tus compras. Mismo lenguaje visual que la galería de remates en vivo del inicio
 * (panel oscuro con foto).
 */
export function ComprasHero({ focus, events }: ComprasHeroProps) {
  return (
    <div className="grid gap-3 lg:h-[26rem] lg:grid-cols-[minmax(0,1fr)_23rem]">
      <section
        aria-label="Tu próximo paso"
        className="relative min-h-[26rem] overflow-hidden rounded-2xl bg-ink text-white"
      >
        <CompraCover compra={focus} className="absolute inset-0 h-full w-full" />
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
          <p className="max-w-xl text-base leading-relaxed text-white/85">
            {getStatusCopy(focus).nextStepDescription}
          </p>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
            <p className="text-4xl font-semibold tabular-nums tracking-tight">
              {formatCurrency(focus.final_price, CURRENCY)}
            </p>
            <Link
              to={`/mis-compras/${focus.id}`}
              className="group inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-base font-semibold text-ink transition-colors hover:bg-brand-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-ink"
            >
              Ver compra
              <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>

      <ComprasNovedades events={events} />
    </div>
  );
}

/** Lo último que pasó en cada compra, ordenado por fecha: cada fila lleva al detalle. */
export function ComprasNovedades({ events }: { events: CompraEvent[] }) {
  return (
    <aside aria-labelledby="novedades-title" className="flex flex-col rounded-2xl border border-line p-6">
      <h2 id="novedades-title" className="text-lg font-semibold tracking-tight">
        Últimas novedades
      </h2>
      <p className="mt-0.5 text-sm text-ink-muted">Lo último que pasó con tus compras.</p>
      <ul className="mt-4 flex flex-1 flex-col divide-y divide-line">
        {events.map(({ compra, at, text }) => (
          <li key={compra.id}>
            <Link
              to={`/mis-compras/${compra.id}`}
              className="group flex items-center gap-3 rounded-lg py-3 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <CompraCover compra={compra} className="h-12 w-12 shrink-0 rounded-lg" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium leading-snug transition-transform duration-300 group-hover:translate-x-0.5">
                  {compra.lote_title}
                </span>
                <span className="block text-sm text-ink-muted">
                  {text}, {timeAgo(at)}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </aside>
  );
}
