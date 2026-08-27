import clsx from 'clsx';
import { Card } from '../../../shared/components/Card';
import { formatDateTime } from '../../../shared/lib/format';
import { findNoteEntries } from '../utils';
import type { PostAuctionCaseDetail } from '../types';

export interface ObservationsFeedProps {
  data: PostAuctionCaseDetail;
}

/**
 * "Observaciones del rematador" (sección 7 del pedido) -- feed con todas las
 * observaciones (no solo la última, a diferencia de `LastObservationCard` del lado del
 * rematador), más recientes primero. Usa `findNoteEntries` sobre el timeline, la misma
 * fuente de datos que ya expone `get_detail_for_buyer` (`PostAuctionCaseDetail.timeline`)
 * -- no hay un campo separado de "observaciones internas" en el backend
 * (`PostAuctionTimelineEntry` no tiene ninguna bandera de visibilidad), así que todo lo
 * que trae el timeline del comprador ya está pensado para que él lo vea.
 */
export function ObservationsFeed({ data }: ObservationsFeedProps) {
  const notes = findNoteEntries(data.timeline);
  if (notes.length === 0) return null;

  return (
    <Card>
      <h2 className="mb-4 text-sm font-semibold text-slate-900">Observaciones del martillero</h2>
      <ol className="flex flex-col">
        {notes.map((entry, index) => (
          <li
            key={entry.id}
            className={clsx('flex flex-col gap-1', index > 0 && 'mt-4 border-t border-slate-100 pt-4')}
          >
            <p className="text-sm leading-relaxed text-slate-700">&ldquo;{entry.note}&rdquo;</p>
            <p className="text-xs text-slate-400">
              {entry.actor_name ?? 'Martillero'} · {formatDateTime(entry.occurred_at)}
            </p>
          </li>
        ))}
      </ol>
    </Card>
  );
}
