import clsx from 'clsx';
import { formatTime } from '../../../shared/lib/format';
import { RECENT_EVENT_BADGE_VARIANTS, RECENT_EVENT_LABELS } from '../labels';
import type { RecentAnalyticsEvent } from '../types';

const DOT_COLOR_CLASSES: Record<string, string> = {
  brand: 'bg-brand-500',
  success: 'bg-success-500',
  danger: 'bg-danger-500',
  warning: 'bg-amber-500',
  neutral: 'bg-slate-400',
};

export interface EventsTimelineProps {
  events: RecentAnalyticsEvent[];
}

/** Línea de tiempo de eventos relevantes -- una lista, no un gráfico (no todo dato
 * numérico necesita convertirse en un chart). Reconstruida por el backend a partir de
 * `Lote.opened_at`/`closed_at`/`Remate.finished_at`/`cancelled_at` -- no incluye
 * `remate.started`/`paused`/`resumed` (sin timestamp persistido, ver ADR-038 sección F). */
export function EventsTimeline({ events }: EventsTimelineProps) {
  if (events.length === 0) {
    return <p className="py-4 text-center text-sm text-slate-400">Todavía no hay eventos.</p>;
  }

  return (
    <ul className="flex max-h-56 flex-col gap-2 overflow-y-auto">
      {events.map((event, index) => (
        <li
          key={`${event.event_type}-${event.occurred_at}-${index}`}
          className="flex items-start gap-2 text-sm"
        >
          <span
            aria-hidden="true"
            className={clsx(
              'mt-1.5 h-2 w-2 shrink-0 rounded-full',
              DOT_COLOR_CLASSES[RECENT_EVENT_BADGE_VARIANTS[event.event_type]],
            )}
          />
          <span className="flex-1 text-slate-700">
            {RECENT_EVENT_LABELS[event.event_type]}
            {event.lot_number && (
              <span className="text-slate-500"> -- Lote {event.lot_number}</span>
            )}
          </span>
          <span className="shrink-0 text-xs text-slate-400">{formatTime(event.occurred_at)}</span>
        </li>
      ))}
    </ul>
  );
}
