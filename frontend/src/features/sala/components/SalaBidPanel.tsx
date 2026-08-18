import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { formatCurrency } from '../../../shared/lib/format';
import type { UserRole } from '../../auth/types';
import type { Lote, RemateStatus } from '../../remates/types';
import type { OfertaSnapshotEntry } from '../types';
import { PlaceBidButton } from './PlaceBidButton';

export interface SalaBidPanelProps {
  remateId: string;
  lote: Lote;
  currency: string;
  winningOffer: OfertaSnapshotEntry | null;
  remateStatus: RemateStatus;
  viewerRole: UserRole | undefined;
}

/**
 * Precio actual + formulario de ofertar (rediseño visual, Sala del Remate -- ver
 * prototipo aprobado). Antes esto vivía dentro de `ActiveLotePanel`, en una sub-columna
 * con card/gradiente propios, al lado de la imagen; ahora es su propia pieza en el
 * sidebar derecho de `SalaPage`, sobre `SalaSidePanel` (historial/chat) -- composición
 * nueva, mismos datos y mismo `PlaceBidButton` de siempre (ningún cambio de
 * comportamiento: valida, ofrece sugerencias, ofrece, todo igual). `currentOfferAmount`
 * es exactamente el mismo cálculo que ya hacía `ActiveLotePanel`.
 *
 * Sin cuenta regresiva (pedido explícito, decisión visual confirmada -- el timer sigue
 * activo en el backend/anti-sniping cuando el remate lo tiene configurado, ADR-043, acá
 * solo se dejó de mostrar). `LoteCountdown` queda sin usar en la Sala pero no se borró
 * el componente ni su lógica.
 */
export function SalaBidPanel({ remateId, lote, currency, winningOffer, remateStatus, viewerRole }: SalaBidPanelProps) {
  const currentOfferAmount = winningOffer?.amount ?? lote.base_price;

  // Animación sutil de "el precio acaba de cambiar" (mejora de UX, no toca WebSockets ni
  // cómo se calcula/envía la oferta -- solo reacciona al valor que ya llega por props).
  // Se dispara solo cuando el precio sube dentro del mismo lote -- así cambiar de lote
  // activo (que también cambia `currentOfferAmount` al nuevo precio base) no dispara la
  // animación pensada para "alguien ofertó".
  const [isPriceFlashing, setIsPriceFlashing] = useState(false);
  const previousRef = useRef({ loteId: lote.id, amount: currentOfferAmount });

  useEffect(() => {
    const previous = previousRef.current;
    const isSameLote = previous.loteId === lote.id;
    const hasIncreased = Number(currentOfferAmount) > Number(previous.amount);
    previousRef.current = { loteId: lote.id, amount: currentOfferAmount };

    if (!isSameLote || !hasIncreased) return;

    setIsPriceFlashing(true);
    const timeoutId = setTimeout(() => setIsPriceFlashing(false), 600);
    return () => clearTimeout(timeoutId);
  }, [lote.id, currentOfferAmount]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
          {winningOffer ? 'Oferta actual · Comprador verificado' : 'Precio inicial'}
        </p>
        <p
          className={clsx(
            'mt-1.5 font-mono text-[44px] font-semibold tabular-nums tracking-tight text-ink',
            isPriceFlashing && 'animate-price-flash',
          )}
        >
          {formatCurrency(currentOfferAmount, currency)}
        </p>
        <p className="mt-1 font-mono text-xs tabular-nums text-ink-faint">
          Base {formatCurrency(lote.base_price, currency)} · incremento mínimo{' '}
          {formatCurrency(lote.min_increment, currency)}
        </p>
      </div>

      <PlaceBidButton
        remateId={remateId}
        lote={lote}
        currency={currency}
        winningOffer={winningOffer}
        remateStatus={remateStatus}
        viewerRole={viewerRole}
      />
    </div>
  );
}
