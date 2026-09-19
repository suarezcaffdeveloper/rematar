import { OfferHistoryList } from '../../sala/components/OfferHistoryList';
import { useLoteRecentOffers } from '../hooks';

export interface TimedLoteHistoryCardProps {
  remateId: string;
  loteId: string;
  /** Sube en cada oferta aceptada/rechazada de ESTE lote -- dispara el refetch (ver
   * `useLoteRecentOffers`). */
  offerActivityVersion: number;
  currency: string;
  currentUserId: string | null;
}

/**
 * Historial de ofertas del lote fijado, debajo de `TimedLoteBidRail` en la misma
 * columna angosta (pedido explícito, "ponelas debajo de la card de ofertar"). Sin card
 * envolvente (pedido explícito, "no todo englobado dentro de cards") -- un separador
 * fino (`border-t`) alcanza para distinguirlo del panel de arriba, mismo criterio "sin
 * card" que el resto de la sala. Muestra todo lo que devuelve `useLoteRecentOffers`
 * (ya acotado del lado del backend), sin recortar de nuevo del lado del cliente.
 */
export function TimedLoteHistoryCard({
  remateId,
  loteId,
  offerActivityVersion,
  currency,
  currentUserId,
}: TimedLoteHistoryCardProps) {
  const { offers } = useLoteRecentOffers(remateId, loteId, offerActivityVersion);

  return (
    <div className="border-t border-line pt-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">
          <span className="h-1.5 w-1.5 rounded-full bg-success-500" aria-hidden="true" />
          Ofertas recientes
        </h3>
        <span className="text-xs text-ink-faint">
          {offers.length === 1 ? '1 oferta' : `${offers.length} ofertas`}
        </span>
      </div>
      <OfferHistoryList recentOffers={offers} currency={currency} currentUserId={currentUserId} />
    </div>
  );
}
