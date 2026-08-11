import { Card } from '../../../shared/components/Card';
import { formatDateTime } from '../../../shared/lib/format';
import { findLastNoteEntry } from '../utils';
import type { PostAuctionCaseDetail } from '../types';

export interface LastObservationCardProps {
  data: PostAuctionCaseDetail;
}

/** "Última observación" (sección 8) -- destaca `data.notes` sola, sin mezclarla con el
 * historial completo (eso lo cubre la sección de Actividad más abajo, a la que enlaza
 * "Ver historial completo"). */
export function LastObservationCard({ data }: LastObservationCardProps) {
  if (!data.notes) return null;

  const lastNoteEntry = findLastNoteEntry(data.timeline);

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-900">Última observación</h2>
        <a href="#actividad" className="text-xs font-medium text-brand-600 hover:text-brand-700">
          Ver historial completo
        </a>
      </div>
      <p className="mt-3 text-sm italic text-slate-700">&ldquo;{data.notes}&rdquo;</p>
      {lastNoteEntry && (
        <p className="mt-2 text-xs text-slate-400">
          {lastNoteEntry.actor_name ?? 'Sistema'} · {formatDateTime(lastNoteEntry.occurred_at)}
        </p>
      )}
    </Card>
  );
}
