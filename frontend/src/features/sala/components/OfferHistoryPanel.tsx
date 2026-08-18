import { memo } from 'react';
import { BadgeCheck } from 'lucide-react';
import clsx from 'clsx';
import { Badge } from '../../../shared/components/Badge';
import { formatCurrency, formatTime } from '../../../shared/lib/format';
import { OFERTA_STATUS_BADGE_VARIANTS, OFERTA_STATUS_LABELS } from '../labels';
import type { OfertaSnapshotEntry } from '../types';

export interface OfferHistoryPanelProps {
  winningOffer: OfertaSnapshotEntry | null;
  recentOffers: OfertaSnapshotEntry[];
  currency: string;
  /** Altura del panel -- `h-72` por default. `SalaPage` (Épica 9, "refinamiento
   * visual") lo fija en un valor exacto para que el panel nunca crezca a medida que
   * llegan ofertas nuevas -- antes solo la lista interna tenía `max-h-72`, pero la
   * tarjeta entera (encabezado + lista) sí crecía con cada oferta nueva hasta tocar ese
   * tope, empujando y achicando visualmente al `ChatPanel` de al lado (`flex-1` en el
   * mismo sidebar de altura fija). Mismo patrón que el `className` de `ChatPanel`. */
  className?: string;
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
    <li className="flex items-center justify-between gap-2 py-2">
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
 * Panel lateral: quién lidera (de forma anónima -- ver `features/sala/types.ts` sobre
 * `buyer_id`) y el historial reciente de ofertas. `recentOffers` viene acotado a las
 * últimas 10 (`SnapshotService.DEFAULT_RECENT_OFFERS_LIMIT`, backend) -- el contador de
 * acá refleja exactamente eso, "ofertas recientes", nunca se presenta como el total
 * histórico del lote (que el backend no expone en ningún endpoint hoy).
 *
 * Retexturizado sobre el prototipo aprobado (captura puntual de la Consola Operativa):
 * pierde la card propia (`rounded-xl border bg-white shadow-sm p-5`) -- eyebrows sueltos
 * + un separador `border-t` entre "Comprador líder" y "Ofertas recientes" alcanzan, el
 * único elemento con fondo propio es el callout verde de "Comprador verificado" (sí
 * amerita destacarse, es el dato más importante del panel). Cada fila del historial
 * pasa de una píldora con fondo (`bg-surface-subtle`) a una fila separada por hairline
 * (`divide-y`) -- montos en `font-mono` (mismo tratamiento que el resto del sistema de
 * diseño para cifras grandes, ver `Input`, variante `underline`).
 */
export function OfferHistoryPanel({ winningOffer, recentOffers, currency, className }: OfferHistoryPanelProps) {
  return (
    <div className={clsx('flex flex-col gap-4', className ?? 'h-72 shrink-0')}>
      <div className="shrink-0">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-faint">Comprador líder</h2>
        {winningOffer ? (
          <div className="mt-2 flex items-center gap-2 rounded-lg border-2 border-success-500 bg-success-50 px-3 py-2">
            <BadgeCheck aria-hidden="true" className="h-5 w-5 shrink-0 text-success-600" />
            <div className="min-w-0">
              <p className="text-base font-semibold text-ink">Comprador verificado</p>
              <p className="text-sm text-success-700">Lidera con {formatCurrency(winningOffer.amount, currency)}</p>
            </div>
          </div>
        ) : (
          <p className="mt-2 text-sm text-ink-muted">Todavía no hay ofertas en este lote.</p>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col border-t border-line pt-4">
        <div className="flex shrink-0 items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-faint">Ofertas recientes</h2>
          <span className="text-sm font-semibold text-ink-muted">{recentOffers.length}</span>
        </div>

        {recentOffers.length === 0 ? (
          <p className="mt-2 text-sm text-ink-muted">Sin ofertas todavía.</p>
        ) : (
          <ul className="mt-1 flex min-h-0 flex-1 flex-col divide-y divide-line overflow-y-auto pr-1">
            {recentOffers.map((offer) => (
              <OfferHistoryEntry key={offer.id} offer={offer} currency={currency} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
