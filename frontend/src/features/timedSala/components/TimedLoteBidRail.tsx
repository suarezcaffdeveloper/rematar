import { formatCurrency } from '../../../shared/lib/format';
import type { UserRole } from '../../auth/types';
import { GarantiaGate } from '../../garantias/components/GarantiaGate';
import type { GarantiaStatus } from '../../garantias/types';
import type { Lote, RemateStatus } from '../../remates/types';
import { LoteCountdown } from '../../sala/components/LoteCountdown';
import { PlaceBidButton } from '../../sala/components/PlaceBidButton';
import type { OfertaSnapshotEntry } from '../../sala/types';

export interface TimedLoteBidRailProps {
  lote: Lote;
  currency: string;
  leadingAmount: string | null;
  remateId: string;
  remateStatus: RemateStatus;
  viewerRole: UserRole | undefined;
  /** `true` si quien está mirando la pantalla es quien va liderando ESTE lote ahora
   * mismo (`TimedSalaPage`, a partir de `leadingBuyerIds`). Se lo pasa tal cual a
   * `PlaceBidButton`, que reemplaza el form por un aviso ("Vas liderando este lote")
   * para no dejar que se sobreoferte a sí mismo. */
  isLeadingBidder: boolean;
  /** Ver `PlaceBidButton` -- `false` únicamente si el remate exige garantía económica y
   * el comprador todavía no tiene una `Garantia` `active` (`GarantiaGate`,
   * `TimedSalaPage`). */
  hasRequiredGuarantee: boolean;
  /** `true` si este remate exige garantía y quien mira es `comprador` -- controla si se
   * renderiza `GarantiaGate` debajo del botón de pujar (ver `TimedSalaPage`). */
  showGarantiaGate: boolean;
  /** `RemateSettings.guarantee_amount` -- `null` si el remate no exige garantía. */
  guaranteeAmount: string | null;
  /** Sube el estado resuelto por `GarantiaGate` hasta `TimedSalaPage`, que lo usa para
   * calcular `hasRequiredGuarantee`. */
  onGarantiaStatusChange: (status: GarantiaStatus | null) => void;
}

/** `PlaceBidButton`/`computeMinimumAmount` (`features/sala/`) solo leen `.amount` de
 * este objeto -- mismo criterio que tenía `TimedLoteDetailPanel` (reemplazado por este
 * panel): no hay una oferta puntual "seleccionada" fuera del monto líder por lote. */
function toWinningOfferEntry(amount: string | null): OfertaSnapshotEntry | null {
  if (amount === null) return null;
  return { id: '', buyer_id: null, amount, status: 'winning', created_at: '' };
}

/**
 * Columna angosta (340px, match del mockup de referencia) al lado de
 * `TimedLoteCenterPanel` -- cuenta regresiva y formulario de oferta del lote fijado.
 * Sin card envolvente alrededor de precio/oferta/garantía (pedido explícito, "no todo
 * englobado dentro de cards"): mismo criterio "sin card" que `SalaBidPanel.tsx` (Sala
 * LIVE), separadores finos (`border-y`) en vez de una caja blanca -- el único elemento
 * con superficie propia acá es `LoteCountdown` (`variant="boxed"`), que ya es un aviso
 * puntual con color semántico (urgencia), no una card de contenido genérico. El
 * historial ya no vive acá -- pasa a `TimedLoteHistoryCard`, debajo de este panel
 * (pedido explícito, "ponelas debajo de la card de ofertar"), renderizado por
 * `TimedSalaPage` en la misma columna angosta.
 *
 * Orden vertical (pedido explícito):
 * 1. Timer (si tiene) -- `LoteCountdown` boxed
 * 2. Base + Incremento -- línea compacta con separadores finos
 * 3. Precio actual -- grande, `font-mono text-2xl`
 * 4. Formulario de oferta -- `PlaceBidButton` reusado tal cual (ya incluye las
 *    "ofertas rápidas precalculadas" como chips de sugerencia)
 * 5. `GarantiaGate` -- debajo del botón de pujar, no arriba de la página (pedido
 *    explícito): indica si la garantía económica ya está activa o si todavía hace
 *    falta constituirla, justo donde el comprador está a punto de ofertar.
 */
export function TimedLoteBidRail({
  lote,
  currency,
  leadingAmount,
  remateId,
  remateStatus,
  viewerRole,
  isLeadingBidder,
  hasRequiredGuarantee,
  showGarantiaGate,
  guaranteeAmount,
  onGarantiaStatusChange,
}: TimedLoteBidRailProps) {
  const isOpen = lote.status === 'open';
  const isClosed = lote.status === 'closed_sold' || lote.status === 'closed_unsold';
  const currentPrice = leadingAmount ?? lote.base_price;
  const winningOffer = toWinningOfferEntry(leadingAmount);

  const hasTimer =
    isOpen && (lote.timer_ends_at !== null || lote.timer_paused_remaining_seconds !== null);

  return (
    <div className="flex flex-col gap-4">
      {hasTimer && (
        <LoteCountdown
          endsAt={lote.timer_ends_at}
          pausedRemainingSeconds={lote.timer_paused_remaining_seconds}
          variant="boxed"
        />
      )}

      <div className="flex items-center justify-between border-y border-line py-2 text-xs text-ink-faint">
        <span>Base: {formatCurrency(lote.base_price, currency)}</span>
        <span>Inc: {formatCurrency(lote.min_increment, currency)}</span>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
          {isClosed ? 'Precio final' : 'Precio actual'}
        </p>
        <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-ink">
          {lote.status === 'closed_unsold'
            ? 'Sin ofertas'
            : formatCurrency(lote.final_price ?? currentPrice, currency)}
        </p>
      </div>

      {isOpen && (
        <PlaceBidButton
          remateId={remateId}
          lote={lote}
          currency={currency}
          winningOffer={winningOffer}
          remateStatus={remateStatus}
          viewerRole={viewerRole}
          isLeadingBidder={isLeadingBidder}
          hasRequiredGuarantee={hasRequiredGuarantee}
        />
      )}

      {showGarantiaGate && guaranteeAmount !== null && (
        <GarantiaGate
          remateId={remateId}
          amount={guaranteeAmount}
          currency={currency}
          onStatusChange={onGarantiaStatusChange}
        />
      )}
    </div>
  );
}
