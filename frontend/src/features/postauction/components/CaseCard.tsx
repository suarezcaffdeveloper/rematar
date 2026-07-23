import { Link } from 'react-router-dom';
import { formatCurrency, formatDateTime } from '../../../shared/lib/format';
import { StatusBadge } from './StatusBadge';
import type { PostAuctionCase } from '../types';

export interface CaseCardProps {
  item: PostAuctionCase;
  to: string;
  /** `rematador`: muestra el nombre del comprador. `comprador`: muestra el nombre del
   * rematador -- cada lado de la relación ve a la otra parte, nunca a sí mismo. */
  perspective: 'rematador' | 'comprador';
  currency?: string;
}

export function CaseCard({ item, to, perspective, currency = 'ARS' }: CaseCardProps) {
  const counterpartLabel = perspective === 'rematador' ? 'Comprador' : 'Rematador';
  const counterpartName =
    perspective === 'rematador' ? item.buyer_name : item.rematador_name;

  return (
    <Link
      to={to}
      className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:border-brand-300 hover:bg-brand-50/30"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold text-slate-900">{item.lote_title}</h3>
          <p className="text-xs text-slate-500">
            Lote {item.lot_number} · {item.remate_title}
          </p>
        </div>
        <StatusBadge status={item.status} />
      </div>

      <div className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 text-sm">
        <div className="flex flex-col">
          <span className="text-xs text-slate-500">Precio final</span>
          <span className="font-medium text-slate-900">{formatCurrency(item.final_price, currency)}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-xs text-slate-500">{counterpartLabel}</span>
          <span className="font-medium text-slate-900">{counterpartName ?? '—'}</span>
        </div>
        <div className="col-span-2 flex flex-col">
          <span className="text-xs text-slate-500">Adjudicado el</span>
          <span className="font-medium text-slate-900">{formatDateTime(item.created_at)}</span>
        </div>
      </div>
    </Link>
  );
}
