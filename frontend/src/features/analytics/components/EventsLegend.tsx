import clsx from 'clsx';
import { EVENT_DOT_COLOR_CLASSES, RECENT_EVENT_BADGE_VARIANTS, RECENT_EVENT_LABELS } from '../labels';
import type { RecentAnalyticsEvent, RecentAnalyticsEventType } from '../types';

export interface EventsLegendProps {
  events: RecentAnalyticsEvent[];
}

const ALL_EVENT_TYPES = Object.keys(RECENT_EVENT_LABELS) as RecentAnalyticsEventType[];

/** Leyenda de colores para `EventsTimeline` -- solo lista los tipos de evento que
 * efectivamente aparecen en `events` (no tiene sentido explicar el color de "Remate
 * cancelado" si este remate nunca tuvo ese evento). Orden fijo (`RECENT_EVENT_LABELS`),
 * no el de aparición, para que la leyenda no salte de posición entre refetches. */
export function EventsLegend({ events }: EventsLegendProps) {
  const presentTypes = ALL_EVENT_TYPES.filter((type) =>
    events.some((event) => event.event_type === type),
  );
  if (presentTypes.length === 0) return null;

  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
      {presentTypes.map((type) => (
        <li key={type} className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className={clsx('h-1.5 w-1.5 rounded-full', EVENT_DOT_COLOR_CLASSES[RECENT_EVENT_BADGE_VARIANTS[type]])}
          />
          {RECENT_EVENT_LABELS[type]}
        </li>
      ))}
    </ul>
  );
}
