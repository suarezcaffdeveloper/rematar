import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { AlertTriangle, ArrowUp, X } from 'lucide-react';
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
  /** `true` si quien mira la sala es, ahora mismo, el comprador que va liderando este
   * lote -- ver `SalaPage` sobre por qué esto no puede salir de `winningOffer.buyer_id`
   * (siempre enmascarado para un comprador, ADR-031). Se lo pasa a `PlaceBidButton` para
   * no invitarlo a sobreofertarse a sí mismo (pedido explícito). */
  isLeadingBidder: boolean;
  /** Ver `PlaceBidButton` -- `false` únicamente si el remate exige garantía económica y
   * el comprador todavía no tiene una `Garantia` `active` (`useGarantiaStatus`,
   * `SalaPage`). */
  hasRequiredGuarantee: boolean;
  /** Abre el diálogo para constituir la garantía (`GarantiaModal`, montado por
   * `SalaPage`) -- `PlaceBidButton` lo usa para reemplazar su formulario por un botón
   * amarillo "Construir garantía" cuando falta la garantía. Ver `PlaceBidButton`. */
  onBuildGuarantee?: () => void;
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
 *
 * Precio centrado y más grande, con "Base + incremento mínimo" fusionado debajo en texto
 * chico (pedido explícito, mismo tratamiento "opción A" ya aplicado en la Sala Timed --
 * ver `TimedLoteBidRail`): punto verde al lado del label mientras el remate está `live`,
 * y una píldora transitoria "+$ X desde la última oferta" (~2.6s) cuando una oferta nueva
 * sube el precio de este mismo lote.
 *
 * Rediseño "mesa de ofertas" (Sala en vivo, ver `SalaPage`): el precio va alineado a la
 * izquierda y sin mayúsculas, como el resto del sistema; y si quien mira iba liderando y
 * alguien lo supera, aparece un aviso "Te superaron: ahora lidera $ X" (con cierre) --
 * antes el único indicio era que el formulario volvía a ofrecer un monto. El wrapper lleva
 * `id="bid-form"` para que la barra fija de celular (`SalaMobileBidBar`) pueda llevar hasta acá.
 */
export function SalaBidPanel({
  remateId,
  lote,
  currency,
  winningOffer,
  remateStatus,
  viewerRole,
  isLeadingBidder,
  hasRequiredGuarantee,
  onBuildGuarantee,
}: SalaBidPanelProps) {
  const currentOfferAmount = winningOffer?.amount ?? lote.base_price;
  const isRemateLive = remateStatus === 'live';

  // "+$ X desde la última oferta" + flash del precio (mejora de UX, no toca WebSockets ni
  // cómo se calcula/envía la oferta -- solo reacciona al valor que ya llega por props). Se
  // dispara solo cuando el precio sube dentro del mismo lote -- así cambiar de lote activo
  // (que también cambia `currentOfferAmount` al nuevo precio base) no dispara el aviso
  // pensado para "alguien ofertó".
  const [priceBump, setPriceBump] = useState<string | null>(null);
  const previousRef = useRef({ loteId: lote.id, amount: currentOfferAmount });

  useEffect(() => {
    const previous = previousRef.current;
    const isSameLote = previous.loteId === lote.id;
    const delta = Number(currentOfferAmount) - Number(previous.amount);
    previousRef.current = { loteId: lote.id, amount: currentOfferAmount };

    if (!isSameLote || delta <= 0) {
      setPriceBump(null);
      return;
    }

    setPriceBump(String(delta));
    const timeoutId = setTimeout(() => setPriceBump(null), 2600);
    return () => clearTimeout(timeoutId);
  }, [lote.id, currentOfferAmount]);

  // "Te superaron": solo si quien mira iba liderando ESTE lote y deja de hacerlo porque
  // otra oferta subió el precio (no al cambiar de lote, ni porque el lote se cerró).
  const [outbidNotice, setOutbidNotice] = useState<string | null>(null);
  const leadingRef = useRef({ loteId: lote.id, isLeading: isLeadingBidder });

  useEffect(() => {
    const previous = leadingRef.current;
    leadingRef.current = { loteId: lote.id, isLeading: isLeadingBidder };
    if (previous.loteId !== lote.id) {
      setOutbidNotice(null);
      return;
    }
    if (isLeadingBidder) {
      setOutbidNotice(null);
      return;
    }
    if (previous.isLeading && winningOffer) {
      setOutbidNotice(`Te superaron: ahora lidera ${formatCurrency(winningOffer.amount, currency)}.`);
    }
  }, [lote.id, isLeadingBidder, winningOffer, currency]);

  return (
    <div id="bid-form" className="flex scroll-mt-6 flex-col gap-4">
      <div className="flex flex-col items-start gap-1.5 text-left">
        <p className="flex items-center gap-2 text-sm text-ink-muted">
          {isRemateLive && <span className="h-1.5 w-1.5 rounded-full bg-success-500" aria-hidden="true" />}
          {winningOffer ? 'Oferta actual · Comprador verificado' : 'Precio inicial'}
        </p>
        <p
          className={clsx(
            'font-mono text-[2.75rem] font-semibold leading-none tabular-nums tracking-tight text-ink xl:text-[3.25rem]',
            priceBump !== null && 'animate-price-flash',
          )}
        >
          {formatCurrency(currentOfferAmount, currency)}
        </p>
        {/* Espacio reservado fijo para el pill "+$X": siempre se renderiza el slot
         * (h-7 ~= alto del pill) y solo se alterna `invisible`, así aparecer/desaparecer
         * no empuja el resto del contenido (layout shift). */}
        <div className="flex h-7 items-center">
          <span
            className={clsx(
              'inline-flex items-center gap-1 rounded-full bg-success-50 px-3 py-1 text-xs font-semibold text-success-700',
              priceBump === null && 'invisible',
            )}
          >
            <ArrowUp aria-hidden="true" className="h-3 w-3" />
            +{formatCurrency(priceBump ?? '0', currency)} desde la última oferta
          </span>
        </div>
        <p className="font-mono text-xs tabular-nums text-ink-faint">
          Base {formatCurrency(lote.base_price, currency)} · incremento mínimo{' '}
          {formatCurrency(lote.min_increment, currency)}
        </p>
      </div>

      {outbidNotice && (
        <div role="alert" className="flex items-start gap-2.5 rounded-xl bg-warning-50 px-3.5 py-3 text-sm text-warning-800">
          <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          <p className="flex-1">{outbidNotice}</p>
          <button
            type="button"
            onClick={() => setOutbidNotice(null)}
            aria-label="Cerrar aviso"
            className="rounded p-0.5 hover:bg-warning-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-warning-600"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
      )}

      <PlaceBidButton
        remateId={remateId}
        lote={lote}
        currency={currency}
        winningOffer={winningOffer}
        remateStatus={remateStatus}
        viewerRole={viewerRole}
        isLeadingBidder={isLeadingBidder}
        hasRequiredGuarantee={hasRequiredGuarantee}
        onBuildGuarantee={onBuildGuarantee}
      />
    </div>
  );
}
