import clsx from 'clsx';
import { Badge } from '../../../shared/components/Badge';
import { EmptyState } from '../../../shared/components/EmptyState';
import { formatDateTime } from '../../../shared/lib/format';
import {
  FileTextIcon,
  GavelIcon,
  MailIcon,
  MessageSquareIcon,
  RefreshIcon,
} from '../../remates/components/icons';
import { describeTimelineAction, STATUS_LABELS } from '../labels';
import type { TimelineEntry } from '../types';

const ACTION_BADGE_VARIANTS: Record<string, 'brand' | 'success' | 'danger' | 'neutral'> = {
  case_created: 'brand',
  status_changed: 'success',
  note_added: 'neutral',
  notification_sent: 'success',
  notification_failed: 'danger',
  document_uploaded: 'brand',
  document_deleted: 'neutral',
};

const ACTION_DOT_CLASSES: Record<string, string> = {
  case_created: 'bg-brand-50 text-brand-600 ring-brand-200',
  status_changed: 'bg-success-50 text-success-600 ring-success-200',
  note_added: 'bg-slate-100 text-slate-500 ring-slate-200',
  notification_sent: 'bg-success-50 text-success-600 ring-success-200',
  notification_failed: 'bg-danger-50 text-danger-600 ring-danger-200',
  document_uploaded: 'bg-brand-50 text-brand-600 ring-brand-200',
  document_deleted: 'bg-slate-100 text-slate-500 ring-slate-200',
};

const ACTION_ICONS: Record<string, typeof GavelIcon> = {
  case_created: GavelIcon,
  status_changed: RefreshIcon,
  note_added: MessageSquareIcon,
  notification_sent: MailIcon,
  notification_failed: MailIcon,
  document_uploaded: FileTextIcon,
  document_deleted: FileTextIcon,
};

export interface TimelineProps {
  entries: TimelineEntry[];
}

/** Línea de tiempo del proceso post-remate (pedido explícito del enunciado: fecha,
 * usuario, acción, estado anterior, estado nuevo) -- línea vertical conectando cada
 * entrada + ícono por tipo de acción para diferenciar de un vistazo cambios de estado,
 * observaciones y acciones del sistema (pedido explícito, sección 10). Sin agrupar por
 * día: el historial de un caso puntual suele ser corto. */
export function Timeline({ entries }: TimelineProps) {
  if (entries.length === 0) {
    return <EmptyState title="Sin actividad registrada" description="Todavía no hay eventos en este caso." />;
  }

  return (
    <ol className="flex max-h-[30rem] flex-col overflow-y-auto pr-1">
      {entries.map((entry, index) => {
        const Icon = ACTION_ICONS[entry.action] ?? MessageSquareIcon;
        const isLast = index === entries.length - 1;
        return (
          <li key={entry.id} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span
                className={clsx(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-1 ring-inset',
                  ACTION_DOT_CLASSES[entry.action] ?? ACTION_DOT_CLASSES.note_added,
                )}
              >
                <Icon className="h-4 w-4" />
              </span>
              {!isLast && <span className="w-px flex-1 bg-slate-200" aria-hidden="true" />}
            </div>
            <div className={clsx('flex min-w-0 flex-1 flex-col gap-1', !isLast && 'pb-5')}>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={ACTION_BADGE_VARIANTS[entry.action] ?? 'neutral'}>
                  {describeTimelineAction(entry.action)}
                </Badge>
                <span className="text-xs text-slate-400">{formatDateTime(entry.occurred_at)}</span>
              </div>
              <p className="text-xs text-slate-500">{entry.actor_name ?? 'Sistema'}</p>
              {entry.previous_status && entry.new_status && (
                <p className="text-xs text-slate-600">
                  {STATUS_LABELS[entry.previous_status]} → {STATUS_LABELS[entry.new_status]}
                </p>
              )}
              {entry.note && <p className="text-sm text-slate-700">"{entry.note}"</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
