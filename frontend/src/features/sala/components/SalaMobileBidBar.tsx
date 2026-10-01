import { formatCurrency } from '../../../shared/lib/format';
import type { Lote } from '../../remates/types';
import type { OfertaSnapshotEntry } from '../types';

export interface SalaMobileBidBarProps {
  lote: Lote;
  winningOffer: OfertaSnapshotEntry | null;
  currency: string;
  isLeadingBidder: boolean;
}

/**
 * Barra fija abajo, solo en pantallas chicas (por debajo de `xl`): ahí la mesa de ofertas
 * queda entre el lote y el chat y se pierde de vista al scrollear, así que el precio
 * vigente y el atajo para ofertar acompañan siempre. El botón lleva hasta el formulario
 * (`#bid-form`, el wrapper de `SalaBidPanel`).
 */
export function SalaMobileBidBar({ lote, winningOffer, currency, isLeadingBidder }: SalaMobileBidBarProps) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-4 border-t border-line bg-white/95 px-4 py-3 shadow-[0_-8px_24px_-12px_rgba(16,17,20,0.25)] backdrop-blur xl:hidden">
      <div>
        <p className="text-xs text-ink-muted">{winningOffer ? 'Oferta actual' : 'Precio inicial'}</p>
        <p className="font-mono text-xl font-semibold tabular-nums text-ink">
          {formatCurrency(winningOffer?.amount ?? lote.base_price, currency)}
        </p>
      </div>
      <a
        href="#bid-form"
        className="rounded-full bg-brand-600 px-6 py-3 font-semibold text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
      >
        {isLeadingBidder ? 'Vas liderando' : 'Ofertar'}
      </a>
    </div>
  );
}
