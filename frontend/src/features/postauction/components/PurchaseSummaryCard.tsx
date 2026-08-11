import { Card } from '../../../shared/components/Card';
import { formatCurrency, formatDateTime } from '../../../shared/lib/format';
import type { PostAuctionCaseDetail } from '../types';

export interface PurchaseSummaryCardProps {
  data: PostAuctionCaseDetail;
  currency?: string;
}

/**
 * Información económica y principal de la compra (sección 3 del pedido) -- precio final
 * con la mayor jerarquía posible, sin repetir lo que ya muestra el header (nombre del
 * lote/estado) ni lo que muestra `RematadorInfoCard` (rematador ya tiene su propia
 * sección, sección 5 del pedido).
 */
export function PurchaseSummaryCard({ data, currency = 'ARS' }: PurchaseSummaryCardProps) {
  return (
    <Card>
      <div className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Precio final</p>
          <p className="mt-1.5 text-2xl font-extrabold tabular-nums text-brand-700">
            {formatCurrency(data.final_price, currency)}
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Adjudicado</p>
          <p className="mt-1.5 text-sm font-medium text-slate-700">{formatDateTime(data.created_at)}</p>
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Remate</p>
          <p className="mt-1.5 truncate text-sm font-medium text-slate-700">{data.remate_title}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Lote</p>
          <p className="mt-1.5 text-sm font-medium text-slate-700">Lote {data.lot_number}</p>
        </div>
      </div>
    </Card>
  );
}
