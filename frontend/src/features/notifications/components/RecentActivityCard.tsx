import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { Card } from '../../../shared/components/Card';
import { Skeleton } from '../../../shared/components/Skeleton';
import { formatDateTime } from '../../../shared/lib/format';
import { useNotifications } from '../hooks';
import { notificationIcon } from '../labels';

const RECENT_COUNT = 5;
const SKELETON_COUNT = 3;

/**
 * "Actividad reciente" de ambos dashboards (Épica 9, Etapa 3 -- rediseño). Reusa el
 * mismo Notification Service que `NotificationBell` (Header) -- no hay una fuente de
 * "actividad" separada de las notificaciones: el backend no expone un feed de auditoría
 * agregado por todos los remates propios de un usuario (solo por remate puntual o
 * global-admin, ver `AuditService`), así que las notificaciones ya generadas ante cada
 * evento relevante (lote adjudicado, cambio de estado post-remate, umbral de ofertas
 * inválidas superado) son, en los hechos, el feed de actividad reciente del usuario.
 */
export function RecentActivityCard() {
  const { data, isLoading, markAsRead } = useNotifications(RECENT_COUNT);

  return (
    <Card>
      <h2 className="text-sm font-semibold text-slate-900">Actividad reciente</h2>
      <div className="mt-3 flex flex-col gap-1">
        {isLoading ? (
          Array.from({ length: SKELETON_COUNT }, (_, index) => (
            <Skeleton key={index} className="h-14 rounded-lg" />
          ))
        ) : !data || data.items.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">Todavía no hay actividad reciente.</p>
        ) : (
          data.items.map((notification) => {
            const Icon = notificationIcon(notification.type);
            const isUnread = notification.read_at === null;
            const row = (
              <div className={clsx('flex items-start gap-3 rounded-lg px-2 py-2 text-sm', isUnread && 'bg-brand-50/50')}>
                <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-slate-900">{notification.title}</p>
                  <p className="truncate text-xs text-slate-500">{notification.message}</p>
                </div>
                <span className="shrink-0 text-xs text-slate-400">{formatDateTime(notification.created_at)}</span>
              </div>
            );

            return notification.remate_id ? (
              <Link
                key={notification.id}
                to={`/remates/${notification.remate_id}`}
                onClick={() => {
                  if (isUnread) void markAsRead(notification.id);
                }}
                className="rounded-lg transition-colors hover:bg-slate-50"
              >
                {row}
              </Link>
            ) : (
              <div key={notification.id}>{row}</div>
            );
          })
        )}
      </div>
    </Card>
  );
}
