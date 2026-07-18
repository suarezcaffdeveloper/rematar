import { Badge } from '../../../shared/components/Badge';
import { formatDateTime } from '../../../shared/lib/format';
import type { ConnectionStatus } from '../../../shared/websocket/client';
import { CalendarIcon, PersonIcon } from '../../remates/components/icons';
import { STATUS_BADGE_VARIANTS, STATUS_LABELS } from '../../remates/labels';
import type { Remate } from '../../remates/types';
import { ConnectionStatusBadge } from './ConnectionStatusBadge';
import { UsersIcon } from './icons';

export interface SalaHeaderProps {
  remate: Remate;
  connectedUsers: number;
  connectionStatus: ConnectionStatus;
}

/** Cabecera de la sala: identidad del remate + quién más está mirando en este momento.
 * `connectedUsers` viene del `RoomManager` (Épica 3.4) a través del snapshot -- es real,
 * no un placeholder, pero solo se actualiza en cada reconexión (nuevo snapshot), no
 * evento a evento: el backend todavía no publica presencia en tiempo real (ver
 * docs/28-websocket-tiempo-real-sala.md, "Limitaciones conocidas"). `connectionStatus`
 * (Épica 4.6) sí es en vivo -- refleja el estado real de la conexión WebSocket. */
export function SalaHeader({ remate, connectedUsers, connectionStatus }: SalaHeaderProps) {
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
        <span className="flex items-center gap-1.5">
          <PersonIcon className="h-4 w-4 shrink-0 text-slate-400" />
          Rematador verificado
        </span>
        <span className="flex items-center gap-1.5 font-medium text-slate-700">
          <UsersIcon className="h-4 w-4 shrink-0 text-slate-400" />
          {connectedUsers} {connectedUsers === 1 ? 'conectado' : 'conectados'}
        </span>
      </div>
    </div>
  );
}
