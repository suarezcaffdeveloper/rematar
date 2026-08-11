import clsx from 'clsx';
import { CoverPlaceholder } from '../../remates/components/CoverPlaceholder';
import { BoxIcon } from '../../remates/components/icons';
import { getStatusCopy } from '../buyerStatusCopy';
import { STATUS_BADGE_VARIANTS, STATUS_LABELS, type BadgeVariant } from '../labels';
import type { PostAuctionCaseDetail } from '../types';

export interface PurchaseHeaderProps {
  data: PostAuctionCaseDetail;
}

const STATUS_TEXT_CLASSES: Record<BadgeVariant, string> = {
  brand: 'text-brand-700',
  success: 'text-success-700',
  danger: 'text-danger-700',
  warning: 'text-warning-700',
  neutral: 'text-slate-700',
};

const STATUS_DOT_CLASSES: Record<BadgeVariant, string> = {
  brand: 'bg-brand-500',
  success: 'bg-success-500',
  danger: 'bg-danger-500',
  warning: 'bg-warning-500',
  neutral: 'bg-slate-400',
};

/**
 * Identidad de la compra + estado actual, con mucha jerarquía visual (pedido explícito
 * del rediseño del panel del comprador, sección 1/2 del pedido): a diferencia del header
 * compacto del rematador (`SaleHeader`, una sola franja), acá el estado es el protagonista
 * -- texto grande, coloreado por semántica de estado, con una frase contextual propia por
 * estado (`getStatusCopy`) en vez de un badge chico entre otros datos.
 */
export function PurchaseHeader({ data }: PurchaseHeaderProps) {
  const variant = STATUS_BADGE_VARIANTS[data.status];
  const copy = getStatusCopy(data);

  return (
    <div className="flex flex-col gap-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex min-w-0 items-center gap-4">
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl sm:h-20 sm:w-20">
          {data.lote_cover_image_url ? (
            <img src={data.lote_cover_image_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <CoverPlaceholder className="h-full w-full" icon={<BoxIcon className="h-7 w-7 text-brand-300" />} />
          )}
        </div>
        <div className="min-w-0">
          <p className="truncate text-xs font-medium uppercase tracking-wide text-slate-400">
            Lote {data.lot_number} · {data.remate_title}
          </p>
          <h1 className="mt-0.5 truncate text-xl font-bold text-slate-900 sm:text-2xl">{data.lote_title}</h1>
        </div>
      </div>

      <div className="flex flex-col gap-1.5 border-t border-slate-100 pt-5">
        <div className="flex items-center gap-2.5">
          <span className={clsx('h-2.5 w-2.5 shrink-0 rounded-full', STATUS_DOT_CLASSES[variant])} aria-hidden="true" />
          <p className={clsx('text-2xl font-extrabold sm:text-3xl', STATUS_TEXT_CLASSES[variant])}>
            {STATUS_LABELS[data.status]}
          </p>
        </div>
        <p className="text-sm text-slate-600">{copy.headline}</p>
      </div>
    </div>
  );
}
