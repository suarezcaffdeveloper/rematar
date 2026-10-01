import { formatCurrency } from '../../../shared/lib/format';
import type { UserRole } from '../../auth/types';
import type { Lote, RemateStatus } from '../../remates/types';
import { LoteCountdown } from '../../sala/components/LoteCountdown';
import { SalaBidPanel } from '../../sala/components/SalaBidPanel';
import type { OfertaSnapshotEntry } from '../../sala/types';

export interface TimedLoteBidRailProps {
  lote: Lote;
  currency: string;
  leadingAmount: string | null;
  remateId: string;
  remateStatus: RemateStatus;
  viewerRole: UserRole | undefined;
  /** `true` si quien mira la pantalla es quien va liderando ESTE lote ahora mismo
   * (`TimedSalaPage`, a partir de `leadingBuyerIds`). */
  isLeadingBidder: boolean;
  /** Ver `PlaceBidButton` -- `false` únicamente si el remate exige garantía económica y
   * el comprador todavía no tiene una `Garantia` `active`. */
  hasRequiredGuarantee: boolean;
  /** Abre el diálogo para constituir la garantía (`GarantiaModal`, montado por
   * `TimedSalaPage`). */
  onBuildGuarantee?: () => void;
}

/** `PlaceBidButton`/`computeMinimumAmount` (`features/sala/`) solo leen `.amount` de este
 * objeto: no hay una oferta puntual "seleccionada" fuera del monto líder por lote. */
function toWinningOfferEntry(amount: string | null): OfertaSnapshotEntry | null {
  if (amount === null) return null;
  return { id: '', buyer_id: null, amount, status: 'winning', created_at: '' };
}

/** Cinco minutos: desde ahí el cronómetro pasa a rojo. */
const URGENT_SECONDS = 5 * 60;

/**
 * La mesa de ofertas de un lote Timed: cuenta regresiva de ESE lote (cada uno cierra en su
 * propio momento) y, debajo, el mismo panel de precio y formulario de la Sala en vivo
 * (`SalaBidPanel`: precio, aviso de "Te superaron", sugerencias, garantía).
 *
 * Un lote que ya no está abierto no tiene formulario: muestra su precio final, o el aviso
 * de que cerró sin ofertas o de que todavía no abrió.
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
  onBuildGuarantee,
}: TimedLoteBidRailProps) {
  if (lote.status === 'open') {
    const hasTimer = lote.timer_ends_at !== null || lote.timer_paused_remaining_seconds !== null;

    return (
      <div className="flex flex-col gap-5">
        {hasTimer && (
          <LoteCountdown
            endsAt={lote.timer_ends_at}
            pausedRemainingSeconds={lote.timer_paused_remaining_seconds}
            variant="strip"
            urgentThresholdSeconds={URGENT_SECONDS}
          />
        )}
        <SalaBidPanel
          remateId={remateId}
          lote={lote}
          currency={currency}
          winningOffer={toWinningOfferEntry(leadingAmount)}
          remateStatus={remateStatus}
          viewerRole={viewerRole}
          isLeadingBidder={isLeadingBidder}
          hasRequiredGuarantee={hasRequiredGuarantee}
          onBuildGuarantee={onBuildGuarantee}
        />
      </div>
    );
  }

  const isSold = lote.status === 'closed_sold';
  const isUnsold = lote.status === 'closed_unsold';

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-ink-muted">{isSold ? 'Precio final' : isUnsold ? 'Cierre' : 'Precio base'}</p>
      <p className="font-mono text-[2.75rem] font-semibold leading-none tabular-nums tracking-tight text-ink">
        {isUnsold ? 'Sin ofertas' : formatCurrency(lote.final_price ?? lote.base_price, currency)}
      </p>
      <p className="mt-2 rounded-xl bg-surface-subtle px-4 py-3 text-sm text-ink-muted">
        {isSold
          ? 'Este lote ya se vendió. No se aceptan más ofertas.'
          : isUnsold
            ? 'Este lote cerró sin ofertas.'
            : `Este lote todavía no abrió. Cuando abra, vas a poder ofertar desde ${formatCurrency(lote.base_price, currency)}.`}
      </p>
    </div>
  );
}
