import { Link } from 'react-router-dom';
import { Clock, CheckCircle2 } from 'lucide-react';
import { formatCurrency, formatDateShort } from '../../../shared/lib/format';
import { RemateCover } from '../../remates/components/home/RemateCover';
import { CATEGORY_LABELS } from '../../remates/labels';
import { HISTORY_CURRENCY, isCancelled } from '../summary';
import type { FinishedRemateSummary } from '../types';

export interface FinishedRemateCardProps {
  remate: FinishedRemateSummary;
  /** `true` en el panel global del admin: muestra de quién es el remate. */
  showOwner?: boolean;
  /** Portada del remate si tiene (el resumen del backend no la trae). */
  coverImageUrl?: string | null;
  /** Ventas de este remate que todavía no llegaron a "Pago recibido"; `null` si no se
   * sabe (admin, o las ventas todavía cargan). */
  unpaidCount?: number | null;
  currency?: string;
}

/**
 * Un remate terminado en la lista del Historial: portada con su estado y fecha, nombre, lo
 * vendido en grande, cuántos lotes se vendieron (con una barra), y si quedaron ventas sin
 * cobrar. Un remate cancelado dice cuándo y no muestra montos (no vendió nada). Mismo
 * patrón que `RematadorRemateCard` del panel principal; toda la tarjeta lleva al resumen.
 */
export function FinishedRemateCard({ remate, showOwner = false, coverImageUrl, unpaidCount = null, currency = HISTORY_CURRENCY }: FinishedRemateCardProps) {
  const cancelled = isCancelled(remate);
  const to = `/remates/${remate.id}/historial`;
  const soldPercent = remate.lote_count > 0 ? Math.round((remate.lotes_sold_count / remate.lote_count) * 100) : 0;
  const resolved = remate.resolved_at ? formatDateShort(remate.resolved_at) : null;

  return (
    <article className="flex min-w-0 flex-col">
      <Link
        to={to}
        aria-label={`Ver resumen de ${remate.title}`}
        className="group relative block aspect-[16/10] overflow-hidden rounded-2xl bg-surface-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
      >
        <RemateCover
          remate={{ id: remate.id, cover_image_url: coverImageUrl ?? null }}
          className="h-full w-full transition-transform duration-700 ease-out group-hover:scale-105"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink/55 via-transparent to-transparent" />
        <span
          className={`absolute left-3 top-3 rounded-full px-2.5 py-1 text-xs font-semibold shadow-sm ${
            cancelled ? 'bg-white text-danger-600' : 'bg-white text-slate-700'
          }`}
        >
          {cancelled ? 'Cancelado' : 'Finalizado'}
        </span>
        {resolved && <span className="absolute bottom-3 left-3.5 text-sm font-semibold text-white">{resolved}</span>}
      </Link>

      <h3 className="mt-3.5 line-clamp-2 text-xl font-semibold leading-snug tracking-tight">{remate.title}</h3>
      <p className="mt-1 text-sm text-ink-muted">
        {CATEGORY_LABELS[remate.category]}
        {showOwner && remate.owner_name ? ` · ${remate.owner_name}` : ''}
      </p>

      {cancelled ? (
        <p className="mt-3 flex-1 text-sm text-ink-muted">Se canceló antes de terminar. Mirá el motivo en el resumen.</p>
      ) : (
        <>
          <p className="mt-2.5 text-3xl font-semibold leading-none tracking-tight tabular-nums">
            {formatCurrency(remate.total_awarded_value, currency)}
            <span className="mt-1 block text-sm font-medium tracking-normal text-ink-muted">vendidos</span>
          </p>
          <div
            className="mt-3 h-1.5 overflow-hidden rounded-full bg-line"
            role="img"
            aria-label={`${remate.lotes_sold_count} de ${remate.lote_count} lotes vendidos`}
          >
            <div className="h-full rounded-full bg-brand-600" style={{ width: `${soldPercent}%` }} />
          </div>
          <p className="mt-1.5 flex-1 text-sm tabular-nums">
            <b className="font-semibold">
              {remate.lotes_sold_count} de {remate.lote_count}
            </b>{' '}
            lotes vendidos
            {remate.buyer_count > 0 && ` · ${remate.buyer_count} ${remate.buyer_count === 1 ? 'comprador' : 'compradores'}`}
          </p>
          {remate.lotes_sold_count === 0 && <p className="mt-1.5 text-sm text-ink-muted">Ningún lote se vendió en este remate.</p>}
          {unpaidCount !== null && remate.lotes_sold_count > 0 && (
            <p className="mt-2.5">
              {unpaidCount > 0 ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-warning-50 px-2.5 py-1 text-xs font-semibold text-warning-700">
                  <Clock aria-hidden="true" className="h-3 w-3" />
                  {unpaidCount} {unpaidCount === 1 ? 'venta sin cobrar' : 'ventas sin cobrar'}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-success-50 px-2.5 py-1 text-xs font-semibold text-success-700">
                  <CheckCircle2 aria-hidden="true" className="h-3 w-3" />
                  Todo cobrado
                </span>
              )}
            </p>
          )}
        </>
      )}

      <Link
        to={to}
        className="mt-4 inline-flex h-10 items-center justify-center rounded-full bg-ink px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
      >
        Ver resumen
      </Link>
    </article>
  );
}
