import { Badge } from '../../../shared/components/Badge';
import { formatDateTime } from '../../../shared/lib/format';
import type { ConnectionStatus } from '../../../shared/websocket/client';
import { ConnectionStatusBadge } from '../../sala/components/ConnectionStatusBadge';
import { CalendarIcon, ClockIcon, UsersIcon } from '../../remates/components/icons';
import { STATUS_BADGE_VARIANTS, STATUS_LABELS } from '../../remates/labels';
import type { Remate } from '../../remates/types';
import { useElapsedTime } from '../hooks';

export interface ConsolaHeaderProps {
  remate: Remate;
  connectedUsers: number;
  connectionStatus: ConnectionStatus;
}

/**
 * Cabecera de la Consola Operativa (Épica 5, Módulo 5.2): nombre, estado, fecha, tiempo
 * transcurrido y compradores conectados -- todo lo que un rematador necesita ver de un
 * vistazo mientras opera un remate en vivo. Reusa `ConnectionStatusBadge` de
 * `features/sala/` tal cual (componente puro, sin ninguna acción de comprador embebida)
 * en vez de duplicarlo -- mismo indicador que ya usa la Sala del Remate.
 */
export function ConsolaHeader({ remate, connectedUsers, connectionStatus }: ConsolaHeaderProps) {
  const elapsed = useElapsedTime(remate);

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={STATUS_BADGE_VARIANTS[remate.status]}>{STATUS_LABELS[remate.status]}</Badge>
          <ConnectionStatusBadge status={connectionStatus} />
        </div>
        <h1 className="mt-1.5 truncate text-xl font-bold text-slate-900 sm:text-2xl">{remate.title}</h1>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-600">
        {remate.starts_at && (
          <span className="flex items-center gap-1.5">
            <CalendarIcon className="h-4 w-4 shrink-0 text-slate-400" />
            {formatDateTime(remate.starts_at)}
          </span>
        )}
        {elapsed && (
          <span className="flex items-center gap-1.5" title="Tiempo transcurrido desde la fecha programada">
            <ClockIcon className="h-4 w-4 shrink-0 text-slate-400" />
            {elapsed}
          </span>
        )}
        <span className="flex items-center gap-1.5 font-medium text-slate-700">
          <UsersIcon className="h-4 w-4 shrink-0 text-slate-400" />
          {connectedUsers} {connectedUsers === 1 ? 'conectado' : 'conectados'}
        </span>
      </div>
    </div>
  );
}
