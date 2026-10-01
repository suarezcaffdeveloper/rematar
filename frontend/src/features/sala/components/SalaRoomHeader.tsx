import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Badge } from '../../../shared/components/Badge';
import type { ConnectionStatus } from '../../../shared/websocket/client';
import { LiveDot } from '../../remates/components/home/LiveDot';
import { STATUS_BADGE_VARIANTS, STATUS_LABELS } from '../../remates/labels';
import type { Remate } from '../../remates/types';
import { ConnectionStatusBadge } from './ConnectionStatusBadge';
import { PresenceCounter } from './PresenceCounter';

export interface SalaRoomHeaderProps {
  remate: Remate;
  connectedUsers: number;
  connectionStatus: ConnectionStatus;
  /** Adónde lleva la flecha de volver (la ficha del remate). */
  backTo: string;
}

/**
 * Encabezado de la Sala en vivo: el nombre del remate en grande y, a la derecha, su estado
 * y cuántos hay conectados como píldoras. Con aire respecto del nav (la barra superior va
 * fija al principio de la página en esta pantalla, ver `SalaPage`).
 *
 * El título NO se recorta: si es largo baja a un segundo o tercer renglón, porque el
 * nombre del remate es información que hay que poder leer entera; y si aun así las
 * píldoras no entran a su lado, pasan a una fila propia en vez de apretarlo.
 * `ConnectionStatusBadge` solo aparece cuando la conexión NO está abierta -- es el aviso de
 * que lo que se ve puede no estar en vivo, no una decoración permanente.
 */
export function SalaRoomHeader({ remate, connectedUsers, connectionStatus, backTo }: SalaRoomHeaderProps) {
  const isLive = remate.status === 'live';

  return (
    <header className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4 border-b border-line px-3 pb-4 pt-6 sm:px-6 lg:px-10">
      <div className="flex min-w-0 max-w-4xl flex-1 items-start gap-4">
        <Link
          to={backTo}
          aria-label="Volver al remate"
          className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line text-ink-muted transition-colors hover:border-ink hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
        </Link>
        <h1 className="min-w-0 text-balance text-2xl font-semibold leading-tight tracking-tight text-ink sm:text-3xl">
          {remate.title}
        </h1>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2.5 sm:pt-1">
        {connectionStatus !== 'open' && <ConnectionStatusBadge status={connectionStatus} />}
        {isLive ? (
          <span className="inline-flex items-center gap-2 rounded-full bg-success-50 px-3.5 py-1.5 text-sm font-medium text-success-700">
            <LiveDot /> {STATUS_LABELS.live}
          </span>
        ) : (
          <Badge variant={STATUS_BADGE_VARIANTS[remate.status]} className="px-3.5 py-1.5 text-sm">
            {STATUS_LABELS[remate.status]}
          </Badge>
        )}
        <span className="rounded-full bg-surface-subtle px-3.5 py-1.5 text-sm">
          <PresenceCounter count={connectedUsers} />
        </span>
      </div>
    </header>
  );
}
