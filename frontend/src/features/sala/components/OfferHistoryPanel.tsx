import { memo } from 'react';
import { Badge } from '../../../shared/components/Badge';
import { formatCurrency, formatDateTime } from '../../../shared/lib/format';
import { OFERTA_STATUS_BADGE_VARIANTS, OFERTA_STATUS_LABELS } from '../labels';
import type { OfertaSnapshotEntry } from '../types';

export interface OfferHistoryPanelProps {
  winningOffer: OfertaSnapshotEntry | null;
  recentOffers: OfertaSnapshotEntry[];
  currency: string;
}

/** Una fila del historial. `memo`: la lista completa vuelve a montarse cada vez que
 * cambia el snapshot (Épica 4.5 no tiene tiempo real todavía), pero deja la estructura
 * lista para cuando SÍ lo tenga -- un evento de WebSocket que solo agrega una oferta
 * nueva no debería forzar a React a re-renderizar las que ya estaban, y `memo` es
 * exactamente lo que hace falta para eso (ver docs/27-sala-del-remate.md,
 * "Optimización del renderizado"). */
const OfferHistoryEntry = memo(function OfferHistoryEntry({
  offer,
  currency,
}: {
  offer: OfertaSnapshotEntry;
  currency: string;
}) {
  return (
    <li className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-800">{formatCurrency(offer.amount, currency)}</p>
        <p className="text-xs text-slate-400">{formatDateTime(offer.created_at)}</p>
      </div>
      <Badge variant={OFERTA_STATUS_BADGE_VARIANTS[offer.status]}>{OFERTA_STATUS_LABELS[offer.status]}</Badge>
    </li>
  );
});

/**
 * Panel lateral: quién lidera (de forma anónima -- ver `features/sala/types.ts` sobre
 * `buyer_id`) y el historial reciente de ofertas. `recentOffers` viene acotado a las
 * últimas 10 (`SnapshotService.DEFAULT_RECENT_OFFERS_LIMIT`, backend) -- el contador de
 * acá refleja exactamente eso, "ofertas recientes", nunca se presenta como el total
 * histórico del lote (que el backend no expone en ningún endpoint hoy).
 */
export function OfferHistoryPanel({ winningOffer, recentOffers, currency }: OfferHistoryPanelProps) {
  return (
    <div className="flex flex-col gap-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Comprador líder</h2>
        {winningOffer ? (
          <div className="mt-2">
            <p className="text-base font-semibold text-slate-900">Comprador verificado</p>
            <p className="text-sm text-slate-500">Lidera con {formatCurrency(winningOffer.amount, currency)}</p>
          </div>
        ) : (
          <p className="mt-2 text-sm text-slate-500">Todavía no hay ofertas en este lote.</p>
        )}
      </div>

      <div className="border-t border-slate-100 pt-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Ofertas recientes</h2>
          <span className="text-sm font-semibold text-slate-700">{recentOffers.length}</span>
        </div>

        {recentOffers.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">Sin ofertas todavía.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {recentOffers.map((offer) => (
              <OfferHistoryEntry key={offer.id} offer={offer} currency={currency} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
