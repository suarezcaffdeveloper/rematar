import { memo } from 'react';
import { Trophy } from 'lucide-react';
import { formatCurrency, formatRelativeTime } from '../../../shared/lib/format';
import { OFERTA_STATUS_LABELS } from '../labels';
import type { OfertaSnapshotEntry } from '../types';

export interface SalaRecentOffersProps {
  recentOffers: OfertaSnapshotEntry[];
  /** Oferta vigente del lote: la fila que coincide se marca como ganadora. */
  winningOffer: OfertaSnapshotEntry | null;
  currency: string;
  /** Si coincide con `buyer_id` de una oferta (el backend solo deja a la vista el propio
   * id, el de los demás llega enmascarado), esa fila dice "Tú". */
  currentUserId?: string | null;
  /** Clase de alto máximo de la lista (scrollea por dentro). Default: cuatro filas. */
  maxHeightClassName?: string;
  /** Clases del contenedor (borde y margen interno). Default: el de la mesa de ofertas de
   * la Sala en vivo. */
  className?: string;
}

const OfferRow = memo(function OfferRow({
  offer,
  isLeader,
  isOwn,
  currency,
}: {
  offer: OfertaSnapshotEntry;
  isLeader: boolean;
  isOwn: boolean;
  currency: string;
}) {
  return (
    <li className="flex items-center justify-between gap-3 border-b border-line py-2.5 last:border-b-0">
      <div className="min-w-0">
        <p
          className={`font-mono tabular-nums ${isLeader ? 'text-lg font-semibold text-ink' : 'text-sm text-ink-muted'}`}
        >
          {formatCurrency(offer.amount, currency)}
        </p>
        <p className="text-xs text-ink-faint">{formatRelativeTime(offer.created_at)}</p>
      </div>
      {isLeader ? (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-success-50 px-2.5 py-1 text-xs font-semibold text-success-700">
          <Trophy aria-hidden="true" className="h-3 w-3" />
          {isOwn ? 'Tu oferta lidera' : 'Ganadora'}
        </span>
      ) : (
        <span
          className={`shrink-0 text-xs ${
            offer.status === 'rejected' ? 'text-danger-600' : isOwn ? 'font-medium text-success-700' : 'text-ink-faint'
          }`}
        >
          {isOwn ? `Tú, ${OFERTA_STATUS_LABELS[offer.status].toLowerCase()}` : OFERTA_STATUS_LABELS[offer.status]}
        </span>
      )}
    </li>
  );
});

/**
 * Las ofertas recientes del lote en remate, la más nueva arriba. La vigente (la ganadora)
 * va destacada con su monto más grande; el resto, atenuadas. Muestra cuatro filas y el
 * resto se ve con un scroll interno chico: así el panel nunca estira la fila entera cuando
 * entran muchas. Los datos son los mismos de siempre (`OFERTA_STATUS_LABELS`, anonimato de
 * `buyer_id` ya resuelto por el backend/reducer antes de llegar acá).
 */
export function SalaRecentOffers({
  recentOffers,
  winningOffer,
  currency,
  currentUserId,
  maxHeightClassName = 'max-h-[14.75rem]',
  className = 'border-t border-line px-4 pb-4 pt-3 xl:px-5',
}: SalaRecentOffersProps) {
  return (
    <section aria-labelledby="ofertas-recientes" className={className}>
      <h2 id="ofertas-recientes" className="mb-1 flex items-baseline justify-between text-sm font-semibold text-ink">
        Ofertas recientes
        <span className="text-xs font-normal tabular-nums text-ink-faint">{recentOffers.length}</span>
      </h2>
      {recentOffers.length === 0 ? (
        <p className="py-2 text-sm text-ink-faint">Sin ofertas todavía.</p>
      ) : (
        <div className={`${maxHeightClassName} overflow-y-auto pr-1 [scrollbar-width:thin]`}>
          <ul className="flex flex-col">
            {recentOffers.map((offer) => {
              const isLeader = winningOffer !== null ? offer.id === winningOffer.id : false;
              const isOwn = Boolean(currentUserId) && offer.buyer_id === currentUserId;
              return <OfferRow key={offer.id} offer={offer} isLeader={isLeader} isOwn={isOwn} currency={currency} />;
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
