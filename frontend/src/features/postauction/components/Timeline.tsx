import { EmptyState } from '../../../shared/components/EmptyState';
import { formatDateTime } from '../../../shared/lib/format';
import { describeTimelineAction, STATUS_LABELS } from '../labels';
import type { TimelineEntry } from '../types';

export interface TimelineProps {
  entries: TimelineEntry[];
}

/** Línea de tiempo del proceso post-remate (pedido explícito del enunciado: fecha,
 * usuario, acción, estado anterior, estado nuevo) -- mismo criterio visual que
 * `AuditLogTimeline` (`features/audit/components/`), sin agrupar por día: el historial
 * de un caso puntual suele ser corto. */
export function Timeline({ entries }: TimelineProps) {
  if (entries.length === 0) {
    return <EmptyState title="Sin actividad registrada" description="Todavía no hay eventos en este caso." />;
  }

  return (
    <ol className="flex flex-col gap-3">
      {entries.map((entry) => (
        <li key={entry.id} className="flex gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex w-20 shrink-0 flex-col items-start pt-0.5 text-xs font-medium text-slate-500">
            {formatDateTime(entry.occurred_at)}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <p className="text-sm font-medium text-slate-900">{describeTimelineAction(entry.action)}</p>
            <p className="text-xs text-slate-500">{entry.actor_name ?? 'Sistema'}</p>
            {entry.previous_status && entry.new_status && (
              <p className="text-xs text-slate-600">
                {STATUS_LABELS[entry.previous_status]} → {STATUS_LABELS[entry.new_status]}
              </p>
            )}
            {entry.note && <p className="text-sm text-slate-700">"{entry.note}"</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}
