import { Badge } from '../../../shared/components/Badge';
import { Modal } from '../../../shared/components/Modal';
import { formatCurrency } from '../../../shared/lib/format';
import { LOTE_STATUS_BADGE_VARIANTS, LOTE_STATUS_LABELS } from '../../remates/labels';
import type { Lote } from '../../remates/types';
import { ImageGallery } from '../../sala/components/ImageGallery';
import { TimedLoteHistoryCard } from '../../timedSala/components/TimedLoteHistoryCard';

export interface TimedLoteDetailModalProps {
  remateId: string;
  lote: Lote;
  currency: string;
  leadingAmount: string | null;
  offerActivityVersion: number;
  onClose: () => void;
}

/** Detalle de un lote desde el tablero de la empresa: galería completa, precios y el
 * historial reciente de ofertas (enmascarado, mismo endpoint que usa la sala del comprador
 * -- se refresca solo con `offerActivityVersion`). */
export function TimedLoteDetailModal({
  remateId,
  lote,
  currency,
  leadingAmount,
  offerActivityVersion,
  onClose,
}: TimedLoteDetailModalProps) {
  return (
    <Modal isOpen onClose={onClose} title={`Lote ${lote.lot_number} · ${lote.title}`} size="lg">
      <div className="flex flex-col gap-5">
        {lote.images.length > 0 && <ImageGallery images={lote.images} alt={lote.title} />}

        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <Badge variant={LOTE_STATUS_BADGE_VARIANTS[lote.status]}>{LOTE_STATUS_LABELS[lote.status]}</Badge>
          <span className="text-ink-faint">
            Base: <strong className="text-ink">{formatCurrency(lote.base_price, currency)}</strong>
          </span>
          <span className="text-ink-faint">
            Incremento mínimo: <strong className="text-ink">{formatCurrency(lote.min_increment, currency)}</strong>
          </span>
          {leadingAmount != null && (
            <span className="text-ink-faint">
              Precio actual: <strong className="text-success-600">{formatCurrency(leadingAmount, currency)}</strong>
            </span>
          )}
        </div>

        {lote.description && <p className="text-sm leading-relaxed text-ink">{lote.description}</p>}

        <TimedLoteHistoryCard
          remateId={remateId}
          loteId={lote.id}
          offerActivityVersion={offerActivityVersion}
          currency={currency}
          currentUserId={null}
        />
      </div>
    </Modal>
  );
}
