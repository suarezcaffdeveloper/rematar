import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { normalizeApiError } from '../../../shared/api/errors';
import { Button } from '../../../shared/components/Button';
import { Input } from '../../../shared/components/Input';
import { formatCurrency } from '../../../shared/lib/format';
import { isPositiveDecimal } from '../../../shared/lib/validation';
import { useToastStore } from '../../../shared/toast/toastStore';
import type { UserRole } from '../../auth/types';
import type { Lote, RemateStatus } from '../../remates/types';
import { placeBidRequest } from '../api';
import { computeMinimumAmount, computeQuickBidSuggestions } from '../bidding';
import type { OfertaSnapshotEntry } from '../types';

const GROUPING_FORMATTER = new Intl.NumberFormat('es-AR');

/** De lo que pega/tipea la persona a lo que espera el resto del formulario
 * (`isPositiveDecimal`, `computeMinimumAmount`, `placeBidRequest`): dígitos + como mucho
 * un punto decimal. Solo hace falta para el caso de pegar un monto ya formateado (ej.
 * copiar "110.000" desde otro lado) mientras el input está enfocado -- ver el comentario
 * en el `value`/`onChange` de más abajo sobre por qué mientras se tipea se usa el
 * valor "limpio" tal cual, sin agrupar. */
function sanitizeAmountInput(raw: string): string {
  const digitsAndDots = raw.replace(/[^\d.]/g, '');
  const firstDot = digitsAndDots.indexOf('.');
  if (firstDot === -1) return digitsAndDots;
  return `${digitsAndDots.slice(0, firstDot + 1)}${digitsAndDots.slice(firstDot + 1).replace(/\./g, '')}`;
}

/** Del monto "limpio" (`"110000"`/`"110000.5"`) al texto agrupado de a miles que se
 * muestra en el input cuando no está enfocado (`"110.000"`) -- mismo `Intl.NumberFormat`
 * que ya usa `formatCurrency`, sin el símbolo de moneda (ya está a la vista en "Mínimo:"
 * y en los montos sugeridos, ponerlo también acá adentro del input sería ruido y
 * complicaría bastante más escribir/editar el número). Vacío se muestra vacío, no "$ 0"
 * ni "NaN". */
function formatAmountDisplay(clean: string): string {
  if (!clean || Number.isNaN(Number(clean))) return clean;
  const [intPart, decPart] = clean.split('.');
  const groupedInt = GROUPING_FORMATTER.format(Number(intPart || '0'));
  // Coma para el separador decimal en la versión mostrada (`es-AR`, igual que
  // `formatCurrency`) -- el estado interno sigue usando punto (`isPositiveDecimal`,
  // `placeBidRequest`), la coma es solo cosmética acá y nunca vuelve a `sanitizeAmountInput`
  // (que solo procesa el valor crudo mientras el input está enfocado, sin agrupar).
  return decPart === undefined ? groupedInt : `${groupedInt},${decPart}`;
}

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
  const [isAmountFocused, setIsAmountFocused] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const clientTokenRef = useRef<{ amount: string; token: string } | null>(null);

  // Sigue sugiriendo el mínimo vigente mientras la persona no haya escrito un monto
  // propio -- una oferta ajena que llega en vivo (WebSocket) sube el mínimo sin pisarle
  // lo que ya estaba escribiendo.
  useEffect(() => {
    if (!touched) setAmount(minimumAmount);
  }, [minimumAmount, touched]);

  const navigate = useNavigate();
  const location = useLocation();
  const isLoteOpen = lote.status === 'open';
  const isRemateLive = remateStatus === 'live';
  const isComprador = viewerRole === 'comprador';
  const canBid = isLoteOpen && isRemateLive && isComprador;
  // Visitante anónimo (ADR-049): distinto de "sos rematador/empresa/admin mirando tu
  // propia sala" -- acá el problema no es el rol, es no tener sesión, así que la acción
  // es "iniciar sesión", no un mensaje de permisos.
  const isAnonymous = viewerRole === undefined;

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

  const quickBidSuggestions = computeQuickBidSuggestions(lote, winningOffer);

  // Elegir una sugerencia sólo completa el input -- no manda la oferta, eso sigue
  // requiriendo el botón "Ofertar" (pedido explícito, reemplaza al atajo único
  // "+incremento mínimo").
  function handleSelectSuggestion(suggestedAmount: string) {
    setTouched(true);
    setAmount(suggestedAmount);
  }

  if (isAnonymous) {
    return (
      <div className="flex flex-col gap-2">
        <Button
          className="w-full py-2.5 text-sm"
          onClick={() => navigate('/login', { state: { from: location } })}
        >
          Iniciá sesión para ofertar
        </Button>
        <p className="text-center text-xs text-ink-faint">
          Podés seguir mirando el remate en vivo sin loguearte -- para ofertar hace falta una cuenta.
        </p>
      </div>
    );
  }

  if (!canBid) {
    const disabledReason = !isComprador
      ? 'Solo los compradores pueden ofertar en la sala.'
      : !isRemateLive
        ? 'El remate no está en vivo -- no se puede ofertar en este momento.'
        : 'El lote no está abierto para ofertar.';

    return (
      <div className="flex flex-col gap-2">
        <Button disabled className="w-full py-2.5 text-sm" title={disabledReason}>
          Realizar oferta
        </Button>
        <p className="text-center text-xs text-ink-faint">{disabledReason}</p>
      </div>
    );
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-2.5">
      <div>
        <Input
          label="Tu oferta"
          type="text"
          inputMode="decimal"
          variant="underline"
          // Enfocado: el valor "limpio" tal cual, para no pelear con la posición del
          // cursor mientras se tipea (reformatear en cada tecla -- agregar/sacar puntos
          // de miles a medida que crecen los dígitos -- corre el cursor de un lugar
          // impredecible). Sin foco: agrupado de a miles (`formatAmountDisplay`), para
          // que se lea igual que el resto de los montos de la pantalla ("Mínimo: $
          // 110.000") en vez del número crudo (pedido explícito, auditoría mobile).
          value={isAmountFocused ? amount : formatAmountDisplay(amount)}
          onFocus={() => setIsAmountFocused(true)}
          onBlur={() => setIsAmountFocused(false)}
          onChange={(event) => {
            setTouched(true);
            setAmount(sanitizeAmountInput(event.target.value));
          }}
          error={validationError ?? undefined}
          disabled={isSubmitting}
          className="text-lg font-semibold tabular-nums"
        />
        {/* Monto mínimo en su propia línea, separado del label -- si viviera dentro del
         * label (como antes) cada oferta ajena que llega por WebSocket cambia ese texto
         * y puede volcarlo de una línea a dos (o al revés) según cuántos dígitos tenga
         * el nuevo mínimo, empujando el resto del formulario para abajo/arriba en un
         * saltito. Acá, en su propia línea de altura fija y con `tabular-nums`, solo
         * cambian los dígitos -- nunca la altura. */}
        <p className="mt-1 font-mono text-xs tabular-nums text-ink-faint">
          Mínimo: {formatCurrency(minimumAmount, currency)}
        </p>
      </div>

      {/* Ofertas inteligentes: tres montos sugeridos (mínimo válido + dos escalones de
       * un incremento cada uno, ver `computeQuickBidSuggestions`) para completar el
       * input con un click en vez de calcularlo a mano -- elegir uno no manda la oferta,
       * eso sigue siendo el botón "Ofertar" de más abajo (pedido explícito, reemplaza al
       * atajo único "+incremento mínimo" que había antes). `tabular-nums` acá también --
       * mismo motivo que el precio grande de `ActiveLotePanel`, para que una oferta ajena
       * actualizando estos montos no genere el mismo saltito. */}
      <div className="grid grid-cols-3 gap-2">
        {quickBidSuggestions.map((suggestedAmount) => (
          <Button
            key={suggestedAmount}
            type="button"
            variant="chip"
            onClick={() => handleSelectSuggestion(suggestedAmount)}
            disabled={isSubmitting}
            className="min-w-0 whitespace-normal break-words px-1.5 py-2 text-center font-mono text-xs font-semibold leading-tight tabular-nums"
          >
            {formatCurrency(suggestedAmount, currency)}
          </Button>
        ))}
      </div>

      <Button
        type="submit"
        variant="hero"
        isLoading={isSubmitting}
        disabled={Boolean(validationError)}
        className="mt-1 w-full py-2 text-sm font-semibold"
      >
        Ofertar
      </Button>
    </form>
  );
}
