import { formatCurrency } from '../../../shared/lib/format';
import { CoverPlaceholder } from '../../remates/components/CoverPlaceholder';
import { BoxIcon } from '../../remates/components/icons';
import { StatusBadge } from './StatusBadge';
import type { PostAuctionCaseDetail } from '../types';

export interface SaleHeaderProps {
  data: PostAuctionCaseDetail;
  currency?: string;
}

/** Encabezado compacto de la ficha de venta -- portada, lote/remate, estado y precio
 * final, todo en una sola franja en vez del panel degradado + header separado que tenía
 * antes (pedido explícito: "no quiero que el header ocupe demasiado espacio vertical"). */
export function SaleHeader({ data, currency = 'ARS' }: SaleHeaderProps) {
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-4">
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg">
          {data.lote_cover_image_url ? (
            <img src={data.lote_cover_image_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <CoverPlaceholder
              className="h-full w-full"
              icon={<BoxIcon className="h-6 w-6 text-brand-300" />}
            />
          )}
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold text-slate-900">{data.lote_title}</h1>
          <p className="mt-0.5 truncate text-sm text-slate-500">
            Lote {data.lot_number} · {data.remate_title}
          </p>
          <div className="mt-1.5 sm:hidden">
            <StatusBadge status={data.status} />
          </div>
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-6 sm:justify-end">
        <div className="hidden sm:block">
          <StatusBadge status={data.status} />
        </div>
        <div className="text-right">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Precio final</p>
          <p className="text-2xl font-extrabold tabular-nums text-brand-700">
            {formatCurrency(data.final_price, currency)}
          </p>
        </div>
      </div>
    </div>
  );
}
