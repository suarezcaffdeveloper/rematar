import { memo } from 'react';
import { Badge } from '../../../shared/components/Badge';
import { formatCurrency, formatTime } from '../../../shared/lib/format';
import { OFERTA_STATUS_BADGE_VARIANTS, OFERTA_STATUS_LABELS } from '../labels';
import type { OfertaSnapshotEntry } from '../types';

export interface OfferHistoryListProps {
  recentOffers: OfertaSnapshotEntry[];
  currency: string;
}

const OfferHistoryRow = memo(function OfferHistoryRow({
  offer,
  currency,
}: {
  offer: OfertaSnapshotEntry;
  currency: string;
}) {
  return (
    <li className="flex items-center justify-between gap-2 border-b border-line py-2.5 last:border-b-0">
      <div className="min-w-0">
        <p className="font-mono text-sm font-semibold tabular-nums text-ink">
          {formatCurrency(offer.amount, currency)}
        </p>
        <p className="text-xs text-ink-faint">{formatTime(offer.created_at)}</p>
      </div>
      <Badge variant={OFERTA_STATUS_BADGE_VARIANTS[offer.status]} className="shrink-0">
        {OFERTA_STATUS_LABELS[offer.status]}
      </Badge>
    </li>
  );
});

/**
 * Lista abierta de ofertas recientes -- pareja "sin card" de `OfferHistoryPanel`
 * (Consola Operativa del rematador, sin cambios), pensada para vivir dentro de la
 * pestaña "Historial de ofertas" de `SalaSidePanel` (rediseño visual de la Sala del
 * Remate). No incluye el bloque "Comprador líder" que sí tiene `OfferHistoryPanel` --
 * en la Sala esa misma información (si hay oferta ganadora, quién "lidera" de forma
 * anónima) ya se comunica en el precio grande de `SalaBidPanel` ("Oferta actual ·
 * Comprador verificado"), así que repetirla acá sería redundante.
 *
 * Mismos datos/labels reales que `OfferHistoryPanel` (`OFERTA_STATUS_LABELS`/
 * `OFERTA_STATUS_BADGE_VARIANTS`, anonimato de `buyer_id` ya resuelto por el backend/
 * reducer antes de llegar acá) -- ningún cambio de comportamiento, solo de presentación
 * (filas con divisor fino en vez de chips grises, cifras en `font-mono`/`tabular-nums`).
 */
export function OfferHistoryList({ recentOffers, currency }: OfferHistoryListProps) {
  if (recentOffers.length === 0) {
    return <p className="text-sm text-ink-faint">Sin ofertas todavía.</p>;
  }

  return (
    <ul className="flex flex-col">
      {recentOffers.map((offer) => (
        <OfferHistoryRow key={offer.id} offer={offer} currency={currency} />
      ))}
    </ul>
  );
}
