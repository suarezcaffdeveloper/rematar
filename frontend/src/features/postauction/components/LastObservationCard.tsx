import { Eye } from 'lucide-react';
import { formatDateTime } from '../../../shared/lib/format';
import { findLastNoteEntry } from '../utils';
import type { PostAuctionCaseDetail } from '../types';
import { NoteForm } from './NoteForm';

export interface LastObservationCardProps {
  data: PostAuctionCaseDetail;
  onAdded: () => void;
}

/**
 * "Observaciones": la última observación (`data.notes`) y el formulario para agregar una
 * nueva. Avisa lo que antes no se decía: el comprador ve las observaciones, y una nueva
 * reemplaza a la última en esta tarjeta (el historial completo queda en "Actividad", a la
 * que enlaza "Ver historial completo").
 */
export function LastObservationCard({ data, onAdded }: LastObservationCardProps) {
  const lastNoteEntry = data.notes ? findLastNoteEntry(data.timeline) : null;

  return (
    <section aria-labelledby="notes-title" className="rounded-3xl border border-line bg-white p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 id="notes-title" className="text-xs font-bold text-ink-muted">
          Observaciones
        </h2>
        {data.notes && (
          <a href="#actividad" className="text-xs font-semibold text-brand-700 hover:underline">
            Ver historial completo
          </a>
        )}
      </div>

      {data.notes ? (
        <blockquote className="mb-4 rounded-2xl bg-surface-subtle px-4 py-3 text-sm">
          &ldquo;{data.notes}&rdquo;
          {lastNoteEntry && (
            <footer className="mt-1.5 text-xs text-ink-muted">
              {lastNoteEntry.actor_name ?? 'Sistema'} · {formatDateTime(lastNoteEntry.occurred_at)}
            </footer>
          )}
        </blockquote>
      ) : (
        <p className="mb-4 text-sm text-ink-muted">Todavía no hay observaciones.</p>
      )}

      <NoteForm caseId={data.id} onAdded={onAdded} />

      <p className="mt-3 flex gap-2 rounded-2xl bg-warning-50 px-3.5 py-2.5 text-xs text-warning-900">
        <Eye aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        El comprador ve las observaciones. Una nueva reemplaza a la última; el historial completo queda en Actividad.
      </p>
    </section>
  );
}
