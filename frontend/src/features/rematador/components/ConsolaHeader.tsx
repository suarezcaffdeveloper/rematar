import clsx from 'clsx';
import { ConnectionStatusBadge } from '../../sala/components/ConnectionStatusBadge';
import { PresenceCounter } from '../../sala/components/PresenceCounter';
import { formatDateTime } from '../../../shared/lib/format';
import type { ConnectionStatus } from '../../../shared/websocket/client';
import { CalendarIcon, ClockIcon } from '../../remates/components/icons';
import { STATUS_LABELS } from '../../remates/labels';
import type { Remate, RemateStatus } from '../../remates/types';
import { useElapsedTime } from '../hooks';

export interface ConsolaHeaderProps {
  remate: Remate;
  connectedUsers: number;
  connectionStatus: ConnectionStatus;
}

/** Solo un punto de color + el label de estado -- nada de ícono grande ni fondo con
 * degradé (rediseño "Modo Remate" sobre la captura de Stitch): el encabezado deja de ser
 * una "hero card" y pasa a ser una franja limpia y angosta con exactamente cuatro datos
 * (título, fecha, tiempo transcurrido, conectados), pedido explícito para que se vea
 * "limpio y elegante" en vez de competir visualmente con el panel de control. */
const STATUS_DOT_CLASSES: Record<RemateStatus, string> = {
  draft: 'bg-ink-faint',
  scheduled: 'bg-brand-500',
  live: 'bg-warning-500',
  paused: 'bg-ink-faint',
  finished: 'bg-success-500',
  cancelled: 'bg-danger-500',
};

/**
 * Cabecera de la Consola Operativa (Épica 5, Módulo 5.2; rediseñada en la Épica 9,
 * Etapa 6; y de nuevo en el rediseño "Modo Remate" sobre la captura de Stitch/
 * AuctionPro): pedido explícito de esa segunda vuelta -- el encabezado contiene
 * ÚNICAMENTE título, fecha, tiempo transcurrido ("horario") y compradores conectados, sin
 * los badges de estado de remate/timer que tenía antes ("Remate activo"/"Timer activo"
 * de la referencia -- acá vivían como `Badge` de estado + el ícono grande con fondo en
 * degradé). Lo único que queda del estado es un punto de color chico junto al título
 * (mismo criterio minimalista que el "EN VIVO" de la referencia, sin las píldoras
 * redundantes) -- el estado operativo real (`Remate activo`/`Pausado`) ya se lee en
 * `ConsolaControlPanel`, no hace falta repetirlo acá.
 *
 * `ConnectionStatusBadge` (estado de la conexión WebSocket) solo se muestra cuando algo
 * anda mal (`connectionStatus !== 'open'`) -- no es de los cuatro datos pedidos, pero
 * ocultarlo sin más perdería la única señal de "estos datos pueden no estar
 * actualizados"; mostrarlo solo en el caso anómalo mantiene el encabezado limpio en el
 * caso normal sin sacrificar esa alerta.
 *
 * El botón "Salir" que tenía esta cabecera ya no hace falta: el `Sidebar` global dejó de
 * ocultarse en Modo Remate (ver `app/layouts/AppLayout.tsx`), así que la navegación de
 * vuelta al dashboard vive ahí, compacta y siempre visible, sin que este header necesite
 * ofrecer su propia salida.
 *
 * Retexturizado en la Épica 9, Etapa 10 (mismo sistema visual que la Sala del Remate --
 * ver `SalaHeader`, prototipo aprobado): la "hero card" (`rounded-xl border bg-white
 * shadow-sm`) se saca por completo -- mismo criterio que ya aplicó `SalaHeader`, un
 * separador `border-b border-line` alcanza para que el título se sienta parte de la
 * página en vez de un widget encerrado, sin competir con las cards de
 * `ConsolaControlPanel` que sí tienen sentido como tal (agrupan acciones por zona de
 * riesgo, no solo texto).
 *
 * Segunda vuelta sobre el prototipo aprobado (captura puntual de la Consola): el título
 * pasa a vivir solo, a la izquierda, en una única fila -- el punto de estado + label ya
 * no quedan apilados arriba del título (eso lo repetía dos veces: acá y en
 * `ConsolaControlPanel`), se mudan a la derecha junto con fecha/tiempo/conectados, mismo
 * lugar que ocupa el `Badge` de estado en `SalaHeader`.
 */
export function ConsolaHeader({ remate, connectedUsers, connectionStatus }: ConsolaHeaderProps) {
  const elapsed = useElapsedTime(remate);

  return (
    <div className="flex flex-col gap-2 border-b border-line pb-4 sm:flex-row sm:items-center sm:justify-between">
      <h1 className="min-w-0 truncate text-xl font-semibold tracking-tight text-ink sm:text-2xl">{remate.title}</h1>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm text-ink-muted">
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className={clsx(
              'h-2 w-2 shrink-0 rounded-full',
              STATUS_DOT_CLASSES[remate.status],
              remate.status === 'live' && 'animate-pulse',
            )}
          />
          <span className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
            {STATUS_LABELS[remate.status]}
          </span>
        </span>
        {remate.starts_at && (
          <span className="flex items-center gap-1.5">
            <CalendarIcon className="h-4 w-4 shrink-0 text-ink-faint" />
            {formatDateTime(remate.starts_at)}
          </span>
        )}
        {elapsed && (
          <span className="flex items-center gap-1.5" title="Tiempo transcurrido desde la fecha programada">
            <ClockIcon className="h-4 w-4 shrink-0 text-ink-faint" />
            {elapsed}
          </span>
        )}
        <PresenceCounter count={connectedUsers} />
        {connectionStatus !== 'open' && <ConnectionStatusBadge status={connectionStatus} />}
      </div>
    </div>
  );
}
