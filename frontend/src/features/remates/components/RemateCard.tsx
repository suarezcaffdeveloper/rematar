import { useNavigate } from 'react-router-dom';
import { Badge } from '../../../shared/components/Badge';
import { Button } from '../../../shared/components/Button';
import { formatDateTime } from '../../../shared/lib/format';
import { useLoteCount } from '../hooks';
import { CATEGORY_LABELS, STATUS_BADGE_VARIANTS, STATUS_CARD_ACCENT, STATUS_LABELS } from '../labels';
import type { Remate } from '../types';
import { CoverPlaceholder } from './CoverPlaceholder';
import { BoxIcon, CalendarIcon, PinIcon } from './icons';

export interface RemateCardProps {
  remate: Remate;
}

/**
 * Tarjeta de un remate en el dashboard del comprador. No muestra el rematador dueño
 * (`owner_id`): el backend no expone ningún endpoint que resuelva un id de usuario a su
 * nombre para un comprador (`GET /users/{id}` no existe, `GET /users` es solo-admin) --
 * ver docs/25-dashboard-comprador.md, "Limitaciones conocidas". Mostrar el id crudo
 * sería peor que no mostrar nada.
 */
export function RemateCard({ remate }: RemateCardProps) {
  const navigate = useNavigate();
  const loteCount = useLoteCount(remate.id);

  return (
    <article
      className={`group flex flex-col overflow-hidden rounded-2xl border bg-white transition-all duration-300 hover:-translate-y-1 ${STATUS_CARD_ACCENT}`}
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-surface-subtle">
        {remate.cover_image_url ? (
          <img
            src={remate.cover_image_url}
            alt=""
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <CoverPlaceholder className="h-full w-full" />
        )}
        <div className="absolute left-3 top-3">
          <Badge variant={STATUS_BADGE_VARIANTS[remate.status]}>{STATUS_LABELS[remate.status]}</Badge>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-4 p-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">
            {CATEGORY_LABELS[remate.category]}
          </p>
          <h3 className="mt-1.5 line-clamp-2 text-lg font-semibold leading-snug text-ink">{remate.title}</h3>
        </div>

        <dl className="flex flex-col gap-2 text-sm text-ink-muted">
          {remate.starts_at && (
            <div className="flex items-center gap-2">
              <CalendarIcon className="h-4 w-4 shrink-0 text-ink-faint" />
              <span>{formatDateTime(remate.starts_at)}</span>
            </div>
          )}
          {remate.location && (
            <div className="flex items-center gap-2">
              <PinIcon className="h-4 w-4 shrink-0 text-ink-faint" />
              <span className="truncate">{remate.location}</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <BoxIcon className="h-4 w-4 shrink-0 text-ink-faint" />
            <span>
              {loteCount === null
                ? 'Cargando lotes…'
                : `${loteCount} ${loteCount === 1 ? 'lote' : 'lotes'}`}
            </span>
          </div>
        </dl>

        <div className="mt-auto pt-2">
          <Button className="w-full" onClick={() => navigate(`/remates/${remate.id}`)}>
            Ver remate
          </Button>
        </div>
      </div>
    </article>
  );
}
