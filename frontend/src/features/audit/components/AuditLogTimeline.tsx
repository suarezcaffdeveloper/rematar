import { EmptyState } from '../../../shared/components/EmptyState';
import type { AuditLogEntry } from '../types';
import { AuditLogEntryCard } from './AuditLogEntryCard';
import { ClockIcon } from './icons';

export interface AuditLogTimelineProps {
  entries: AuditLogEntry[];
}

const DAY_HEADER_FORMATTER = new Intl.DateTimeFormat('es-AR', {
  weekday: 'long',
  day: '2-digit',
  month: 'long',
  year: 'numeric',
});

function dayKey(iso: string): string {
  return iso.slice(0, 10); // "AAAA-MM-DD", ya viene en UTC del backend
}

/**
 * Línea de tiempo del log de auditoría (Épica 7, Módulo 7.2): tarjetas agrupadas por
 * día, en el orden que ya trae `entries` (lo decide el filtro "Orden" -- ver
 * `AuditLogFilters`, nunca se reordena acá). Evita una tabla, como pide el enunciado.
 */
export function AuditLogTimeline({ entries }: AuditLogTimelineProps) {
  if (entries.length === 0) {
    return (
      <EmptyState
        icon={<ClockIcon className="h-8 w-8" />}
        title="Sin actividad registrada"
        description="No hay entradas de auditoría para los filtros seleccionados."
      />
    );
  }

  const groups: { day: string; items: AuditLogEntry[] }[] = [];
  for (const entry of entries) {
    const key = dayKey(entry.occurred_at);
    const currentGroup = groups.at(-1);
    if (currentGroup && currentGroup.day === key) {
      currentGroup.items.push(entry);
    } else {
      groups.push({ day: key, items: [entry] });
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {groups.map((group) => (
        <div key={group.day} className="flex flex-col gap-2">
          <h3 className="sticky top-0 z-10 bg-slate-50 py-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            {DAY_HEADER_FORMATTER.format(new Date(`${group.day}T00:00:00Z`))}
          </h3>
          <div className="relative flex flex-col gap-2">
            {group.items.length > 1 && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute bottom-4 left-[29px] top-4 w-px bg-slate-200"
              />
            )}
            {group.items.map((entry) => (
              <AuditLogEntryCard key={entry.id} entry={entry} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
