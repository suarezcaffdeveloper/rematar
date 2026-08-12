import type { ReactNode } from 'react';
import { Badge } from '../../../shared/components/Badge';
import { formatDateTime } from '../../../shared/lib/format';
import type { ConnectionStatus } from '../../../shared/websocket/client';
import { CalendarIcon, PersonIcon } from '../../remates/components/icons';
import { STATUS_BADGE_VARIANTS, STATUS_LABELS } from '../../remates/labels';
import type { Remate } from '../../remates/types';
import { ConnectionStatusBadge } from './ConnectionStatusBadge';
import { PresenceCounter } from './PresenceCounter';

export interface SalaHeaderProps {
  remate: Remate;
  connectedUsers: number;
  connectionStatus: ConnectionStatus;
  /** Campana de notificaciones (rediseño -- vista del comprador): `SalaPage` la vuelve a
   * montar acá, a la par del contador de conectados, en vez de en el `Header` global que
   * esta pantalla oculta (ver `useFocusMode(true)` en `SalaPage`). Se recibe como slot,
   * no se importa el feature de notificaciones directo acá -- esta cabecera no necesita
   * saber que existen. */
  notifications?: ReactNode;
}

/** Cabecera de la sala: identidad del remate + quién más está mirando en este momento.
 * `connectedUsers` se mantiene en vivo, evento a evento (Épica 6, Módulo 6.2,
 * `presencia.usuario_conectado`/`desconectado` vía `PresenceCounter`) -- ya no depende
 * de esperar una reconexión para reflejar el número real. `connectionStatus` (Épica
 * 4.6) refleja el estado real de la conexión WebSocket. El badge de estado del remate
 * lleva un pulso sutil cuando está "en vivo" -- indicador de actividad del remate,
 * sin agregar un dato ni componente nuevo.
 *
 * Suelta, sin card (rediseño -- vista del comprador): antes vivía dentro de un
 * `rounded-xl border bg-white shadow-sm`, misma "hero card" que se sacó de
 * `ConsolaHeader`. Acá el pedido fue más lejos -- ni siquiera una franja con fondo,
 * solo un separador inferior sutil, para que el título del remate se sienta parte de
 * la página en vez de un widget encerrado. Sin padding/margen propio arriba: el título
 * arranca pegado al borde superior del `<main>` -- pedido explícito para no dejar
 * espacio en blanco donde antes vivía el navbar global. */
export function SalaHeader({ remate, connectedUsers, connectionStatus, notifications }: SalaHeaderProps) {
  const isLive = remate.status === 'live';
  return (
    <div className="flex flex-col gap-3 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="relative inline-flex">
            {isLive && (
              <span
                aria-hidden="true"
                className="absolute -right-0.5 -top-0.5 h-2 w-2 animate-ping rounded-full bg-success-500"
              />
            )}
            <Badge variant={STATUS_BADGE_VARIANTS[remate.status]}>{STATUS_LABELS[remate.status]}</Badge>
          </span>
          <ConnectionStatusBadge status={connectionStatus} />
        </div>
        <h1 className="mt-2 truncate text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          {remate.title}
        </h1>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-500">
        {remate.starts_at && (
          <span className="flex items-center gap-1.5">
            <CalendarIcon className="h-4 w-4 shrink-0 text-slate-400" />
            {formatDateTime(remate.starts_at)}
          </span>
        )}
        
        <PresenceCounter count={connectedUsers} />
        {notifications}
      </div>
    </div>
  );
}
