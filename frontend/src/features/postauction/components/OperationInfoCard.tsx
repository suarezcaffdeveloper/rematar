import { formatCurrency, formatDateTime } from '../../../shared/lib/format';
import type { PostAuctionCaseDetail } from '../types';

export interface OperationInfoCardProps {
  data: PostAuctionCaseDetail;
  currency?: string;
}

/** "La operación": precio inicial contra el final (con cuánto subió sobre la base), cuándo
 * se adjudicó y a qué remate pertenece. */
export function OperationInfoCard({ data, currency = 'ARS' }: OperationInfoCardProps) {
  const base = Number(data.base_price);
  const final = Number(data.final_price);
  const diff = final - base;
  const percent = base > 0 ? Math.round((diff / base) * 1000) / 10 : null;

  return (
    <section aria-labelledby="operation-title" className="rounded-3xl border border-line bg-white p-5">
      <h2 id="operation-title" className="mb-3 text-xs font-bold text-ink-muted">
        La operación
      </h2>
      <dl className="grid gap-2.5 text-sm">
        <div className="flex items-baseline justify-between gap-4 border-b border-line pb-2.5">
          <dt className="text-ink-muted">Precio inicial</dt>
          <dd className="font-semibold tabular-nums">{formatCurrency(data.base_price, currency)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-4 border-b border-line pb-2.5">
          <dt className="text-ink-muted">Precio final</dt>
          <dd className="text-xl font-semibold tabular-nums tracking-tight">{formatCurrency(data.final_price, currency)}</dd>
        </div>
        {Number.isFinite(diff) && diff !== 0 && (
          <div className="flex items-baseline justify-between gap-4 border-b border-line pb-2.5">
            <dt className="text-ink-muted">{diff > 0 ? 'Sobre la base' : 'Bajo la base'}</dt>
            <dd className={`font-semibold tabular-nums ${diff > 0 ? 'text-success-700' : 'text-danger-600'}`}>
              {diff > 0 ? '+ ' : '- '}
              {formatCurrency(String(Math.abs(diff)), currency)}
              {percent !== null && <span className="ml-1 font-medium text-ink-muted">({diff > 0 ? '+' : '-'}{String(Math.abs(percent)).replace('.', ',')}%)</span>}
            </dd>
          </div>
        )}
        <div className="flex items-baseline justify-between gap-4 border-b border-line pb-2.5">
          <dt className="text-ink-muted">Adjudicado</dt>
          <dd className="font-semibold">{formatDateTime(data.created_at)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-ink-muted">Remate</dt>
          <dd className="text-right font-semibold">{data.remate_title}</dd>
        </div>
      </dl>
    </section>
  );
}
