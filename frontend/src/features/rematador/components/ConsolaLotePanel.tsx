import clsx from 'clsx';
import { Badge } from '../../../shared/components/Badge';
import { EmptyState } from '../../../shared/components/EmptyState';
import { formatCurrency } from '../../../shared/lib/format';
import { ImageGallery } from '../../sala/components/ImageGallery';
import { LoteCountdown } from '../../sala/components/LoteCountdown';
import type { OfertaSnapshotEntry } from '../../sala/types';
import { GavelIcon } from '../../remates/components/icons';
import { CATEGORY_LABELS, LOTE_STATUS_BADGE_VARIANTS, LOTE_STATUS_LABELS } from '../../remates/labels';
import type { Lote } from '../../remates/types';

export interface ConsolaLotePanelProps {
  activeLote: Lote | null;
  currency: string;
  winningOffer: OfertaSnapshotEntry | null;
  hasUpcomingLotes: boolean;
}

function formatAttributeKey(key: string): string {
  const withSpaces = key.replace(/_/g, ' ');
  return withSpaces.charAt(0).toUpperCase() + withSpaces.slice(1);
}

/**
 * Panel principal de la Consola Operativa (Épica 5, Módulo 5.2; reordenado en la Épica
 * 9, Etapa 4/5 -- rediseño): el lote actualmente abierto, con toda su información --
 * imagen principal, galería, número, nombre, descripción, ficha técnica, precio
 * inicial, oferta líder, incremento mínimo y estado. Reusa `ImageGallery` de
 * `features/sala/` tal cual (componente puro, sin ninguna acción de comprador
 * embebida) -- misma vista que ya tiene la Sala del Remate, para que la imagen que ve
 * el rematador sea exactamente la misma que ven los compradores. Mismo criterio de
 * jerarquía visual que `ActiveLotePanel` (Sala, Etapa 4): precio + cuenta regresiva en
 * una zona de acción destacada, antes de la descripción/ficha técnica -- lo que el
 * rematador necesita ver de un vistazo (cuánto se ofrece, cuánto tiempo queda) antes
 * que la información de referencia del lote.
 *
 * Deliberadamente sin ningún botón de acción: a diferencia de `ActiveLotePanel` (Sala,
 * comprador, que embebe `PlaceBidButton`), acá las acciones viven en su propio
 * `ConsolaControlPanel` -- el enunciado de este módulo separa explícitamente "panel
 * principal" de "panel de control", y mezclarlos complicaría reusar este panel el día
 * que la Consola necesite mostrar el lote activo en un contexto sin controles (por
 * ejemplo, una vista de solo lectura para un segundo operador).
 */
export function ConsolaLotePanel({ activeLote, currency, winningOffer, hasUpcomingLotes }: ConsolaLotePanelProps) {
  if (!activeLote) {
    return (
      <EmptyState
        icon={<GavelIcon className="h-10 w-10" />}
        title="Sin lote activo en este momento"
        description={
          hasUpcomingLotes
            ? 'Abrí un lote desde el panel de control para empezar a recibir ofertas.'
            : 'No quedan lotes pendientes en este remate.'
        }
      />
    );
  }

  const attributeEntries = Object.entries(activeLote.attributes);
  const currentOfferAmount = winningOffer?.amount ?? activeLote.base_price;
  const hasTimer = activeLote.timer_ends_at !== null || activeLote.timer_paused_remaining_seconds !== null;

  return (
    <div className="flex flex-col gap-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <ImageGallery key={activeLote.id} images={activeLote.images} alt={activeLote.title} />

      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">
            Lote {activeLote.lot_number} · {CATEGORY_LABELS[activeLote.category]}
          </p>
          <h2 className="mt-1 text-xl font-bold text-slate-900">{activeLote.title}</h2>
        </div>
        <Badge variant={LOTE_STATUS_BADGE_VARIANTS[activeLote.status]}>
          {LOTE_STATUS_LABELS[activeLote.status]}
        </Badge>
      </div>

      <div className="flex flex-col gap-4 rounded-xl border border-brand-100 bg-gradient-to-br from-brand-50/70 to-white p-5">
        <div
          className={clsx('flex flex-col gap-4', hasTimer && 'sm:flex-row sm:items-center sm:justify-between')}
        >
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {winningOffer ? 'Oferta líder' : 'Precio inicial'}
            </p>
            <p className="text-4xl font-extrabold tabular-nums text-brand-700 sm:text-5xl">
              {formatCurrency(currentOfferAmount, currency)}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Precio inicial {formatCurrency(activeLote.base_price, currency)} · incremento mínimo{' '}
              {formatCurrency(activeLote.min_increment, currency)}
            </p>
          </div>

          {hasTimer && (
            <LoteCountdown
              endsAt={activeLote.timer_ends_at}
              pausedRemainingSeconds={activeLote.timer_paused_remaining_seconds}
            />
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-sm leading-relaxed text-slate-600">
          {activeLote.description ?? 'Este lote todavía no tiene una descripción cargada.'}
        </p>

        {(attributeEntries.length > 0 || activeLote.unit_label) && (
          <div className="rounded-lg bg-slate-50 p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Ficha técnica</h3>
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
              {activeLote.unit_label && (
                <div>
                  <dt className="text-xs text-slate-400">Cantidad</dt>
                  <dd className="text-sm text-slate-700">
                    {activeLote.quantity} {activeLote.unit_label}
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
    </div>
  );
}
