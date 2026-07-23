import { Badge } from '../../../shared/components/Badge';
import { formatCurrency } from '../../../shared/lib/format';
import type { UserRole } from '../../auth/types';
import { CATEGORY_LABELS, LOTE_STATUS_BADGE_VARIANTS, LOTE_STATUS_LABELS } from '../../remates/labels';
import type { Lote, RemateStatus } from '../../remates/types';
import type { OfertaSnapshotEntry } from '../types';
import { ImageGallery } from './ImageGallery';
import { LoteCountdown } from './LoteCountdown';
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
 * (Épica 4.5). `lote.attributes` es el campo libre del backend (raza/peso/año/m2, ver
 * `backend/.../lotes/models.py`) -- se renderiza como una ficha de clave/valor genérica,
 * sin asumir qué claves va a tener un lote puntual (distinto tipo de remate, distintos
 * atributos).
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

  return (
    <div className="flex flex-col gap-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <ImageGallery key={lote.id} images={lote.images} alt={lote.title} />

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">
              Lote {lote.lot_number} · {CATEGORY_LABELS[lote.category]}
            </p>
            <h2 className="mt-1 text-xl font-bold text-slate-900">{lote.title}</h2>
          </div>
          <Badge variant={LOTE_STATUS_BADGE_VARIANTS[lote.status]}>{LOTE_STATUS_LABELS[lote.status]}</Badge>
        </div>

        <p className="text-sm leading-relaxed text-slate-600">
          {lote.description ?? 'Este lote todavía no tiene una descripción cargada.'}
        </p>

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

      <LoteCountdown endsAt={lote.timer_ends_at} pausedRemainingSeconds={lote.timer_paused_remaining_seconds} />

      <div className="grid grid-cols-2 gap-4 rounded-lg border border-slate-200 p-4 sm:grid-cols-3">
        <div>
          <p className="text-xs text-slate-400">Precio inicial</p>
          <p className="text-base font-semibold text-slate-700">{formatCurrency(lote.base_price, currency)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-400">{winningOffer ? 'Oferta actual' : 'Sin ofertas todavía'}</p>
          <p className="text-lg font-bold text-brand-700">{formatCurrency(currentOfferAmount, currency)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-400">Incremento mínimo</p>
          <p className="text-base font-semibold text-slate-700">{formatCurrency(lote.min_increment, currency)}</p>
        </div>
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
