import { useEffect, useRef, useState, type FormEvent } from 'react';
import { normalizeApiError } from '../../../shared/api/errors';
import { Button } from '../../../shared/components/Button';
import { Input } from '../../../shared/components/Input';
import { formatCurrency } from '../../../shared/lib/format';
import { isPositiveDecimal } from '../../../shared/lib/validation';
import { useToastStore } from '../../../shared/toast/toastStore';
import type { UserRole } from '../../auth/types';
import type { Lote, RemateStatus } from '../../remates/types';
import { placeBidRequest } from '../api';
import { computeMinimumAmount } from '../bidding';
import type { OfertaSnapshotEntry } from '../types';

export interface PlaceBidButtonProps {
  remateId: string;
  lote: Lote;
  currency: string;
  winningOffer: OfertaSnapshotEntry | null;
  /** Necesario porque un lote puede seguir `open` mientras el remate que lo contiene
   * pasó a `paused` -- `ActiveLotePanel` no perdía ese dato antes porque nunca lo
   * necesitaba, ver `docs/17-auction-engine.md` (regla dura "remate no LIVE"). */
  remateStatus: RemateStatus;
  /** La ruta `/remates/:id/sala` no tiene `RequireRole` (mismo criterio que el resto de
   * `/remates/:remateId/*`, ver `app/router.tsx`) -- un rematador o admin visitando su
   * propia sala no debería ver un formulario que el backend rechazaría con 403
   * (`AuctionEngine.place_bid`, "Solo los compradores pueden ofertar."). */
  viewerRole: UserRole | undefined;
}

/**
 * Formulario real de "Realizar oferta" (reemplaza el placeholder deshabilitado de la
 * Épica 4.5) -- mismo patrón que `features/chat/components/ChatInput.tsx`
 * (`sendMessage`/`isSending`/`sendError`) para el envío, y que
 * `ConsolaControlPanel.tsx` (`useToastStore`) para confirmar el resultado. El precio y
 * el historial visibles para todos los conectados se actualizan solos vía el evento de
 * dominio que el backend ya reenvía por WebSocket (`realtime/reducer.ts`, sin cambios)
 * -- este componente solo le da feedback inmediato a quien ofertó, a partir de la
 * respuesta directa de `POST .../ofertas` (que siempre incluye el resultado, aceptado o
 * rechazado, en el cuerpo -- ver `backend/app/modules/ofertas/router.py`).
 */
export function PlaceBidButton({
  remateId,
  lote,
  currency,
  winningOffer,
  remateStatus,
  viewerRole,
}: PlaceBidButtonProps) {
  const minimumAmount = computeMinimumAmount(lote, winningOffer);
  const [amount, setAmount] = useState(minimumAmount);
  const [touched, setTouched] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const clientTokenRef = useRef<{ amount: string; token: string } | null>(null);

  // Sigue sugiriendo el mínimo vigente mientras la persona no haya escrito un monto
  // propio -- una oferta ajena que llega en vivo (WebSocket) sube el mínimo sin pisarle
  // lo que ya estaba escribiendo.
  useEffect(() => {
    if (!touched) setAmount(minimumAmount);
  }, [minimumAmount, touched]);

  const isLoteOpen = lote.status === 'open';
  const isRemateLive = remateStatus === 'live';
  const isComprador = viewerRole === 'comprador';
  const canBid = isLoteOpen && isRemateLive && isComprador;

  const trimmedAmount = amount.trim();
  const validationError = !isPositiveDecimal(trimmedAmount)
    ? 'Ingresá un monto válido, mayor a 0.'
    : Number(trimmedAmount) < Number(minimumAmount)
      ? `El monto debe ser al menos ${formatCurrency(minimumAmount, currency)}.`
      : null;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (validationError || isSubmitting) return;

    const submittedAmount = trimmedAmount;
    const clientToken =
      clientTokenRef.current?.amount === submittedAmount
        ? clientTokenRef.current.token
        : crypto.randomUUID();
    clientTokenRef.current = { amount: submittedAmount, token: clientToken };

    setIsSubmitting(true);
    try {
      const result = await placeBidRequest(remateId, lote.id, submittedAmount, clientToken);
      if (result.status === 'accepted') {
        useToastStore
          .getState()
          .push('success', `Tu oferta de ${formatCurrency(result.amount, currency)} fue aceptada.`);
        clientTokenRef.current = null;
        setTouched(false);
      } else {
        useToastStore.getState().push('error', result.rejection_reason ?? 'La oferta fue rechazada.');
      }
    } catch (err) {
      useToastStore.getState().push('error', normalizeApiError(err).message);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!canBid) {
    const disabledReason = !isComprador
      ? 'Solo los compradores pueden ofertar en la sala.'
      : !isRemateLive
        ? 'El remate no está en vivo -- no se puede ofertar en este momento.'
        : 'El lote no está abierto para ofertar.';

    return (
      <div className="flex flex-col gap-2 border-t border-slate-100 pt-4">
        <Button disabled className="w-full sm:w-auto" title={disabledReason}>
          Realizar oferta
        </Button>
        <p className="text-xs text-slate-400">{disabledReason}</p>
      </div>
    );
  }

  return (
    <form
      onSubmit={(event) => void handleSubmit(event)}
      className="flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-end"
    >
      <div className="flex-1">
        <Input
          label={`Tu oferta (mínimo ${formatCurrency(minimumAmount, currency)})`}
          type="text"
          inputMode="decimal"
          value={amount}
          onChange={(event) => {
            setTouched(true);
            setAmount(event.target.value);
          }}
          error={validationError ?? undefined}
          disabled={isSubmitting}
        />
      </div>
      <Button
        type="submit"
        isLoading={isSubmitting}
        disabled={Boolean(validationError)}
        className="w-full sm:w-auto"
      >
        Ofertar
      </Button>
    </form>
  );
}
