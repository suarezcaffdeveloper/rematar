import { Card } from '../../../shared/components/Card';
import { formatCurrency, formatDateTime } from '../../../shared/lib/format';
import type { PostAuctionCaseDetail } from '../types';

export interface OperationInfoCardProps {
  data: PostAuctionCaseDetail;
  currency?: string;
}

/** "Información de la operación" (sección 5) -- precio inicial + final, fecha de
 * adjudicación y ganador. Sin incremento mínimo ni cantidad de ofertas (fuera de alcance
 * de este rediseño, ver plan). */
export function OperationInfoCard({ data, currency = 'ARS' }: OperationInfoCardProps) {
  return (
    <Card>
      <h2 className="mb-4 text-sm font-semibold text-slate-900">Información de la operación</h2>
      <dl className="flex flex-col gap-3 text-sm">
        <div className="flex items-center justify-between">
          <dt className="text-slate-500">Precio inicial</dt>
          <dd className="font-medium text-slate-700">{formatCurrency(data.base_price, currency)}</dd>
        </div>
        <div className="flex items-center justify-between border-t border-slate-100 pt-3">
          <dt className="text-slate-500">Precio final</dt>
          <dd className="text-lg font-bold text-brand-700">{formatCurrency(data.final_price, currency)}</dd>
        </div>
        <div className="flex items-center justify-between border-t border-slate-100 pt-3">
          <dt className="text-slate-500">Fecha de adjudicación</dt>
          <dd className="font-medium text-slate-700">{formatDateTime(data.created_at)}</dd>
        </div>
        <div className="flex items-center justify-between border-t border-slate-100 pt-3">
          <dt className="text-slate-500">Ganador</dt>
          <dd className="font-medium text-slate-700">{data.buyer_name ?? '—'}</dd>
        </div>
      </dl>
    </Card>
  );
}
