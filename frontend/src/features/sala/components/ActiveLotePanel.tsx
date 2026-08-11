import { Badge } from '../../../shared/components/Badge';
import { formatCurrency } from '../../../shared/lib/format';
import type { UserRole } from '../../auth/types';
import { CATEGORY_LABELS, LOTE_STATUS_BADGE_VARIANTS, LOTE_STATUS_LABELS } from '../../remates/labels';
import type { Lote, RemateStatus } from '../../remates/types';
import type { OfertaSnapshotEntry } from '../types';
import { LoteCountdown } from './LoteCountdown';
import { LoteHeroImage } from './LoteHeroImage';
import { PlaceBidButton } from './PlaceBidButton';

export interface ActiveLotePanelProps {
  remateId: string;
  lote: Lote;
  currency: string;
  winningOffer: OfertaSnapshotEntry | null;
  remateStatus: RemateStatus;
  viewerRole: UserRole | undefined;
}

function formatAttributeKey(key: string): string {
  const withSpaces = key.replace(/_/g, ' ');
  return withSpaces.charAt(0).toUpperCase() + withSpaces.slice(1);
}

/**
 * Sección principal de la sala: el lote actualmente abierto, con toda su información
 * (Épica 4.5; rediseñado varias veces en la Épica 9 -- ver historial de comentarios en
 * git). Última pasada: imagen principal a todo el ancho arriba (`LoteHeroImage`, sin
 * miniaturas -- alcanza con deslizar/las flechas para recorrer las fotos, una tira de
 * miniaturas debajo quedaba redundante); debajo, una fila de dos columnas -- info del
 * lote (título/descripción) a la izquierda ocupando 2/3 del ancho, zona de ofertar
 * (precio/cuenta regresiva/formulario) a la derecha en el otro 1/3. Recién se separan en
 * columnas a partir de `lg:` (~1024px): en mobile/tablet la columna de ofertar quedaría
 * demasiado angosta, así que se apila en una sola columna como el resto del panel.
 *
 * `lote.attributes` es el campo libre del backend (raza/peso/año/m2, ver
 * `backend/.../lotes/models.py`) -- se renderiza como una ficha de clave/valor genérica,
 * sin asumir qué claves va a tener un lote puntual (distinto tipo de remate, distintos
 * atributos). Sigue a todo el ancho, debajo de la fila de dos columnas -- no forma parte
 * de lo que se reorganizó acá.
 */
export function ActiveLotePanel({
  remateId,
  lote,
  currency,
  winningOffer,
  remateStatus,
  viewerRole,
}: ActiveLotePanelProps) {
  const attributeEntries = Object.entries(lote.attributes);
  const currentOfferAmount = winningOffer?.amount ?? lote.base_price;
  const hasTimer = lote.timer_ends_at !== null || lote.timer_paused_remaining_seconds !== null;

  return (
    <div className="flex h-full flex-col gap-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      {/* `flex-1`: única pieza de la tarjeta que crece -- absorbe lo que sobre de alto
       * (el resto es `h-full` de punta a punta, ver `SalaPage`) para que la tarjeta
       * termine justo donde termina el chat, y de paso la imagen queda más grande
       * verticalmente en vez de topearse en una altura fija chica (pedido explícito).
       * `min-h-*` es el piso para cuando no hay alto extra que repartir (mobile/tablet,
       * donde esta tarjeta no tiene alto explícito -- ver comentario en `SalaPage`). */}
      <LoteHeroImage
        key={lote.id}
        images={lote.images}
        alt={lote.title}
        aspectClassName="min-h-72 flex-1 sm:min-h-80"
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3 lg:items-start">
        <div className="min-w-0 lg:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">
                Lote {lote.lot_number} · {CATEGORY_LABELS[lote.category]}
              </p>
              <h2 className="mt-1 text-xl font-bold text-slate-900">{lote.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                {lote.description ?? 'Este lote todavía no tiene una descripción cargada.'}
              </p>
            </div>
            <Badge variant={LOTE_STATUS_BADGE_VARIANTS[lote.status]}>{LOTE_STATUS_LABELS[lote.status]}</Badge>
          </div>
        </div>

        {/* Zona de acción: precio + cuenta regresiva + ofertar, en su propia columna
         * angosta a la derecha (pedido explícito del rediseño). Precio y cuenta
         * regresiva van uno debajo del otro, no lado a lado -- acá el ancho disponible
         * ya no alcanza para eso. */}
        <div className="flex flex-col gap-4 rounded-xl border border-brand-100 bg-gradient-to-br from-brand-50/70 to-white p-4 lg:col-span-1">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {winningOffer ? 'Oferta actual' : 'Precio inicial'}
            </p>
            <p className="text-3xl font-extrabold tabular-nums text-brand-700">
              {formatCurrency(currentOfferAmount, currency)}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Precio inicial {formatCurrency(lote.base_price, currency)} · incremento mínimo{' '}
              {formatCurrency(lote.min_increment, currency)}
            </p>
          </div>

          {hasTimer && (
            <LoteCountdown endsAt={lote.timer_ends_at} pausedRemainingSeconds={lote.timer_paused_remaining_seconds} />
          )}

          <PlaceBidButton
            remateId={remateId}
            lote={lote}
            currency={currency}
            winningOffer={winningOffer}
            remateStatus={remateStatus}
            viewerRole={viewerRole}
          />
        </div>
      </div>

      {(attributeEntries.length > 0 || lote.unit_label) && (
        <div className="rounded-lg bg-slate-50 p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Ficha técnica</h3>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
            {lote.unit_label && (
              <div>
                <dt className="text-xs text-slate-400">Cantidad</dt>
                <dd className="text-sm text-slate-700">
                  {lote.quantity} {lote.unit_label}
                </dd>
              </div>
            )}
            {attributeEntries.map(([key, value]) => (
              <div key={key}>
                <dt className="text-xs text-slate-400">{formatAttributeKey(key)}</dt>
                <dd className="text-sm text-slate-700">{String(value)}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}
