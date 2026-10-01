import { SalaRecentOffers } from '../../sala/components/SalaRecentOffers';
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
 * Ofertas recientes del lote elegido, debajo del formulario de ofertar: cuatro filas a la
 * vista y scroll interno para el resto. Es la misma lista que la Sala en vivo
 * (`SalaRecentOffers`); la oferta ganadora es la que el servidor marca como `winning`.
 */
export function TimedLoteHistoryCard({
  remateId,
  loteId,
  offerActivityVersion,
  currency,
  currentUserId,
}: TimedLoteHistoryCardProps) {
  const { offers } = useLoteRecentOffers(remateId, loteId, offerActivityVersion);
  const winningOffer = offers.find((offer) => offer.status === 'winning') ?? null;

  return (
    <SalaRecentOffers
      recentOffers={offers}
      winningOffer={winningOffer}
      currency={currency}
      currentUserId={currentUserId}
      className="border-t border-line pt-4"
    />
  );
}
