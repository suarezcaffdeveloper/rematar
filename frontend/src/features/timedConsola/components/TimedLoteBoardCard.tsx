import clsx from 'clsx';
import { Badge } from '../../../shared/components/Badge';
import { formatCurrency } from '../../../shared/lib/format';
import { BoxIcon } from '../../remates/components/icons';
import { CoverPlaceholder } from '../../remates/components/CoverPlaceholder';
import { LOTE_STATUS_BADGE_VARIANTS, LOTE_STATUS_LABELS } from '../../remates/labels';
import type { Lote } from '../../remates/types';
import { LoteCountdown } from '../../sala/components/LoteCountdown';

export interface TimedLoteBoardCardProps {
  lote: Lote;
  currency: string;
  /** Precio líder actual (`useTimedSalaState.leadingAmounts`) -- `null`/`undefined` si el
   * lote todavía no recibió ofertas (o no se pudo resolver). */
  leadingAmount: string | null | undefined;
  /** `null` cuando quien mira no es la empresa dueña (la analítica es owner-only). */
  offerCount: number | null;
  onSelect: (lote: Lote) => void;
}

/**
 * Tarjeta del tablero de la empresa en un remate Timed -- distinta a propósito de las
 * tarjetas de la Consola LIVE: acá no hay "lote activo" ni botones de control, la
 * tarjeta es solo lectura y responde a "cómo va este lote": portada, precio actual contra
 * base, cantidad de ofertas y cuánto falta para que cierre.
 */
export function TimedLoteBoardCard({ lote, currency, leadingAmount, offerCount, onSelect }: TimedLoteBoardCardProps) {
  const cover = lote.images[0]?.url ?? null;
  const isOpen = lote.status === 'open';
  const isSold = lote.status === 'closed_sold';
  const hasBids = leadingAmount != null || isSold;
  const currentPrice = isSold ? (lote.final_price ?? lote.base_price) : (leadingAmount ?? lote.base_price);
  const delta = Number(currentPrice) - Number(lote.base_price);
  const hasTimer = isOpen && (lote.timer_ends_at !== null || lote.timer_paused_remaining_seconds !== null);

  return (
    <button
      type="button"
      onClick={() => onSelect(lote)}
      aria-label={`Ver detalle del lote ${lote.lot_number}: ${lote.title}`}
      className="group flex h-full w-full flex-col overflow-hidden rounded-xl border border-line bg-white text-left shadow-sm transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
    >
      {/* Proporción fija: todas las portadas miden lo mismo aunque la foto original tenga
       * otra forma y quede recortada -- la imagen completa se ve al abrir el lote. */}
      <div data-testid="lote-cover" className="relative aspect-[4/3] w-full shrink-0 overflow-hidden bg-surface-subtle">
        {cover ? (
          <img src={cover} alt="" loading="lazy" className="h-full w-full object-cover object-center" />
        ) : (
          <CoverPlaceholder className="h-full w-full" icon={<BoxIcon className="h-8 w-8 text-brand-300" />} />
        )}
        <span className="absolute left-2 top-2 rounded-md bg-white/90 px-2 py-0.5 text-xs font-semibold text-ink shadow-sm">
          Lote {lote.lot_number}
        </span>
        <div className="absolute right-2 top-2">
          <Badge variant={LOTE_STATUS_BADGE_VARIANTS[lote.status]}>{LOTE_STATUS_LABELS[lote.status]}</Badge>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <h3 className="line-clamp-2 min-h-[2.5rem] text-sm font-semibold text-ink">{lote.title}</h3>

        <div className="flex flex-col gap-0.5">
          <span className="text-xs uppercase tracking-wide text-ink-faint">
            {isSold ? 'Precio final' : hasBids ? 'Precio actual' : 'Base de apertura'}
          </span>
          <div className="flex items-baseline gap-2">
            <span className={clsx('text-xl font-bold tabular-nums', hasBids ? 'text-success-600' : 'text-ink')}>
              {formatCurrency(currentPrice, currency)}
            </span>
            {hasBids && delta > 0 && (
              <span className="text-xs font-medium tabular-nums text-success-600">
                +{formatCurrency(String(delta), currency)}
              </span>
            )}
          </div>
          {/* Línea siempre presente (invisible sin ofertas) para que la altura de la card no
           * dependa de si el lote ya recibió ofertas. */}
          <span className={clsx('text-xs text-ink-faint', !hasBids && 'invisible')} aria-hidden={!hasBids}>
            Base: {formatCurrency(lote.base_price, currency)}
          </span>
        </div>

        <div className="mt-auto flex h-9 items-center justify-between gap-2 border-t border-line pt-3 text-xs">
          <span className="text-ink-faint">
            {offerCount === null ? '' : offerCount === 0 ? 'Sin ofertas' : `${offerCount} ${offerCount === 1 ? 'oferta' : 'ofertas'}`}
          </span>
          {hasTimer ? (
            <LoteCountdown
              variant="inline"
              endsAt={lote.timer_ends_at}
              pausedRemainingSeconds={lote.timer_paused_remaining_seconds}
            />
          ) : null}
        </div>
      </div>
    </button>
  );
}
