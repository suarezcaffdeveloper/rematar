import { formatDateTime } from '../../../shared/lib/format';
import type { ConnectedUserSummary } from '../../sala/types';

export interface ConnectedUsersListProps {
  connectedUsers: ConnectedUserSummary[] | null;
}

/**
 * Lista resumida de usuarios conectados (Épica 6, Módulo 6.2) -- solo para el
 * rematador dueño del remate (o un admin): `connected_users_detail` llega `null` para
 * cualquier otro viewer (`SnapshotService`, mismo criterio de enmascarado que
 * `reserve_price`), así que del lado del comprador este componente nunca recibe datos
 * y no se renderiza. No muestra nombre ni email -- `PresenceService` (backend) nunca
 * conoció `app.modules.users`, deliberado (ver docs/33-sistema-de-presencia.md,
 * "Limitaciones conocidas") para no acoplar presencia al módulo de usuarios; cada
 * conexión se identifica con un fragmento corto de su `user_id`. Se actualiza en vivo,
 * evento a evento (`realtime/reducer.ts`), sin esperar una reconexión.
 */
export function ConnectedUsersList({ connectedUsers }: ConnectedUsersListProps) {
  if (connectedUsers === null) return null;

  const sorted = [...connectedUsers].sort((a, b) => a.connected_at.localeCompare(b.connected_at));

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Conectados ahora</h2>
        <span className="text-sm font-semibold text-slate-700">{connectedUsers.length}</span>
      </div>

      {sorted.length === 0 ? (
        <p className="text-sm text-slate-500">Todavía no hay nadie conectado.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {sorted.map((entry) => (
            <li
              key={entry.connection_id}
              className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2"
            >
              <span className="text-sm font-medium text-slate-700">Usuario #{entry.user_id.slice(0, 8)}</span>
              <span className="text-xs text-slate-400">{formatDateTime(entry.connected_at)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
