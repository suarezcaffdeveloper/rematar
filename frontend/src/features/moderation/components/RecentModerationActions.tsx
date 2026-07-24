import { EmptyState } from '../../../shared/components/EmptyState';
import { Skeleton } from '../../../shared/components/Skeleton';
import { formatDateTime } from '../../../shared/lib/format';
import { describeAction } from '../../audit/labels';
import { Badge } from '../../../shared/components/Badge';
import { useModerationHistory } from '../hooks';

export interface RecentModerationActionsProps {
  remateId: string;
}

const PAGE_SIZE = 10;

/** Historial reciente de acciones de moderación (Épica 7, Módulo 7.6, pedido explícito
 * del enunciado) -- reutiliza el Audit Log ya existente (`ModerationService.
 * list_recent_actions`, backend), mismo criterio de tarjetas por entrada que
 * `AuditLogTimeline` (`features/audit/components/`), sin tabla. */
export function RecentModerationActions({ remateId }: RecentModerationActionsProps) {
  const { data, isLoading, error } = useModerationHistory(remateId, 1, PAGE_SIZE);

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        Historial reciente
      </h2>

      {error ? (
        <p className="text-sm text-danger-600">No se pudo cargar el historial.</p>
      ) : isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-12 rounded-lg" />
          ))}
        </div>
      ) : !data || data.items.length === 0 ? (
        <EmptyState title="Sin acciones registradas" description="Todavía no hubo moderación en esta sala." />
      ) : (
        <ul className="flex flex-col gap-2">
          {data.items.map((entry) => {
            const { label, variant } = describeAction(entry.action);
            return (
              <li key={entry.id} className="flex flex-col gap-1 rounded-lg bg-slate-50 px-3 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={variant}>{label}</Badge>
                  <span className="text-xs text-slate-400">{formatDateTime(entry.occurred_at)}</span>
                </div>
                <span className="text-xs text-slate-500">{entry.actor_name ?? 'Sistema'}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
