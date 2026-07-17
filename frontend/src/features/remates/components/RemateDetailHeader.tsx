import { Badge } from '../../../shared/components/Badge';
import { Button } from '../../../shared/components/Button';
import { CATEGORY_LABELS, STATUS_BADGE_VARIANTS, STATUS_LABELS } from '../labels';
import type { Remate } from '../types';
import { CoverPlaceholder } from './CoverPlaceholder';

export interface RemateDetailHeaderProps {
  remate: Remate;
  onEnterRoom: () => void;
}

/** Portada grande + título + estado + CTA principal -- lo primero que ve el comprador
 * al entrar al detalle. `onEnterRoom` la recibe como prop en vez de navegar acá adentro:
 * este componente no sabe a dónde lleva "Entrar al remate" (hoy un placeholder, mañana
 * la sala real), esa decisión es de `RemateDetailPage`. */
export function RemateDetailHeader({ remate, onEnterRoom }: RemateDetailHeaderProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="relative aspect-[16/9] w-full sm:aspect-[3/1]">
        {remate.cover_image_url ? (
          <img src={remate.cover_image_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <CoverPlaceholder className="h-full w-full" />
        )}
        <div className="absolute left-4 top-4">
          <Badge variant={STATUS_BADGE_VARIANTS[remate.status]}>{STATUS_LABELS[remate.status]}</Badge>
        </div>
      </div>

      <div className="flex flex-col gap-4 p-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">
            {CATEGORY_LABELS[remate.category]}
          </p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900 sm:text-3xl">{remate.title}</h1>
        </div>
        <Button className="w-full shrink-0 sm:w-auto" onClick={onEnterRoom}>
          Entrar al remate
        </Button>
      </div>
    </div>
  );
}
