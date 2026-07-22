import { Link } from 'react-router-dom';
import { Badge } from '../../../shared/components/Badge';
import { formatCurrency } from '../../../shared/lib/format';
import { LOTE_STATUS_BADGE_VARIANTS, LOTE_STATUS_LABELS } from '../../remates/labels';
import type { Lote } from '../../remates/types';

export interface LoteHistoryCardProps {
  remateId: string;
  lote: Lote;
  currency: string;
}

/** Tarjeta de un lote dentro del detalle de historial de un remate (Épica 7, Módulo
 * 7.3) -- reusa el `Lote` que ya trae `useLotes` (Épica 4.4), solo agrega el link al
 * detalle histórico de ese lote en particular. */
export function LoteHistoryCard({ remateId, lote, currency }: LoteHistoryCardProps) {
  return (
    <Link
      to={`/remates/${remateId}/historial/lotes/${lote.id}`}
      className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition-colors hover:border-brand-300 hover:bg-brand-50/30"
    >
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-sm font-medium text-slate-900">
          Lote {lote.lot_number} -- {lote.title}
        </span>
        <Badge variant={LOTE_STATUS_BADGE_VARIANTS[lote.status]}>
          {LOTE_STATUS_LABELS[lote.status]}
        </Badge>
      </div>
      <span className="shrink-0 text-sm font-semibold text-slate-900">
        {lote.final_price ? formatCurrency(lote.final_price, currency) : '—'}
      </span>
    </Link>
  );
}
