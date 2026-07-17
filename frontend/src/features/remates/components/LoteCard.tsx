import { Badge } from '../../../shared/components/Badge';
import { LOTE_STATUS_BADGE_VARIANTS, LOTE_STATUS_LABELS } from '../labels';
import type { Lote } from '../types';
import { CoverPlaceholder } from './CoverPlaceholder';
import { BoxIcon } from './icons';

export interface LoteCardProps {
  lote: Lote;
}

/** Tarjeta de un lote dentro del listado de `RemateDetailPage` -- horizontal en desktop
 * (imagen a la izquierda, datos a la derecha), apilada en mobile. Sin información de
 * ofertas (precio base, incremento, reserva): ese dato es del módulo de ofertas/sala en
 * vivo, explícitamente fuera de alcance acá (ver `types.ts` sobre por qué `Lote` no
 * incluye esos campos todavía). */
export function LoteCard({ lote }: LoteCardProps) {
  const mainImage = [...lote.images].sort((a, b) => a.order - b.order)[0];

  return (
    <article className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md sm:flex-row">
      <div className="relative aspect-video w-full shrink-0 overflow-hidden sm:aspect-square sm:w-40">
        {mainImage ? (
          <img src={mainImage.url} alt={mainImage.caption ?? ''} className="h-full w-full object-cover" />
        ) : (
          <CoverPlaceholder className="h-full w-full" icon={<BoxIcon className="h-8 w-8 text-brand-300" />} />
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <div className="flex items-start justify-between gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Lote {lote.lot_number}
          </span>
          <Badge variant={LOTE_STATUS_BADGE_VARIANTS[lote.status]}>{LOTE_STATUS_LABELS[lote.status]}</Badge>
        </div>
        <h3 className="text-base font-semibold text-slate-900">{lote.title}</h3>
        {lote.description && (
          <p className="line-clamp-2 text-sm text-slate-600">{lote.description}</p>
        )}
      </div>
    </article>
  );
}
