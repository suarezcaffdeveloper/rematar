import { memo } from 'react';
import clsx from 'clsx';
import { Badge } from '../../../shared/components/Badge';
import { formatCurrency, formatDateTime } from '../../../shared/lib/format';
import { OFERTA_STATUS_BADGE_VARIANTS, OFERTA_STATUS_LABELS } from '../../sala/labels';
import type { OfertaSnapshotEntry } from '../../sala/types';

export interface ConsolaOfferPanelProps {
  winningOffer: OfertaSnapshotEntry | null;
  recentOffers: OfertaSnapshotEntry[];
  currency: string;
}

/** Una fila del historial. `memo`: un evento en vivo que agrega una oferta nueva no
 * debería re-renderizar las que ya estaban -- mismo criterio de optimización que
 * `OfferHistoryEntry` en `features/sala/components/OfferHistoryPanel.tsx` (Épica 4.5),
 * acá reimplementado en vez de importado para no acoplar la Consola a un componente de
 * la experiencia del comprador que este módulo tiene prohibido tocar. */
const OfferEntry = memo(function OfferEntry({
  offer,
  currency,
  isLatest,
}: {
  offer: OfertaSnapshotEntry;
  currency: string;
  isLatest: boolean;
}) {
  return (
    <li
      className={clsx(
        'flex items-center justify-between gap-2 rounded-lg px-3 py-2 transition-colors',
        isLatest ? 'bg-brand-50 ring-2 ring-brand-300' : 'bg-slate-50',
      )}
    >
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-800">{formatCurrency(offer.amount, currency)}</p>
        <p className="text-xs text-slate-400">{formatDateTime(offer.created_at)}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {isLatest && <Badge variant="brand">Última</Badge>}
        <Badge variant={OFERTA_STATUS_BADGE_VARIANTS[offer.status]}>{OFERTA_STATUS_LABELS[offer.status]}</Badge>
      </div>
    </li>
  );
});

/**
 * Panel de ofertas de la Consola Operativa (Épica 5, Módulo 5.2): comprador líder
 * (anonimizado -- mismo criterio de privacidad que toda la app, ver
 * `docs/27-sala-del-remate.md`, "Anonimato de compradores": ni siquiera el rematador
 * dueño ve una identidad resoluble, no existe endpoint para eso), historial reciente con
 * hora de cada oferta, y la última oferta recibida destacada visualmente (pedido
 * explícito de este módulo). `winningOffer`/`recentOffers` llegan ya resueltos por
 * `useLiveRemateState` (reusado de `features/sala/hooks.ts`, Épica 4.6) -- este panel no
 * sabe de dónde salen ni si vinieron de HTTP o de un evento de WebSocket.
 */
export function ConsolaOfferPanel({ winningOffer, recentOffers, currency }: ConsolaOfferPanelProps) {
  const latestOfferId = recentOffers[0]?.id;

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
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Historial de ofertas</h2>
          <span className="text-sm font-semibold text-slate-700">{recentOffers.length}</span>
        </div>

        {recentOffers.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">Sin ofertas todavía.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {recentOffers.map((offer) => (
              <OfferEntry key={offer.id} offer={offer} currency={currency} isLatest={offer.id === latestOfferId} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
