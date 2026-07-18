import { Badge } from '../../../shared/components/Badge';
import type { ConnectionStatus } from '../../../shared/websocket/client';

type BadgeVariant = 'brand' | 'success' | 'danger' | 'warning' | 'neutral';

const LABELS: Record<ConnectionStatus, string> = {
  idle: 'Conectando...',
  connecting: 'Conectando...',
  open: 'Conectado',
  reconnecting: 'Reconectando...',
  closed: 'Desconectado',
};

const VARIANTS: Record<ConnectionStatus, BadgeVariant> = {
  idle: 'neutral',
  connecting: 'neutral',
  open: 'success',
  reconnecting: 'warning',
  closed: 'danger',
};

export interface ConnectionStatusBadgeProps {
  status: ConnectionStatus;
}

/** Indicador visual del estado de la conexión en tiempo real (Épica 4, Módulo 4.6) --
 * "Conectado"/"Reconectando..."/"Desconectado", para que el usuario nunca crea que está
 * viendo datos en vivo cuando en realidad la conexión se cayó. Componente propio (no
 * `shared/`) porque hoy solo la sala lo usa -- si un futuro Chat/Presencia necesita el
 * mismo indicador, se comparte recién en ese momento (YAGNI). */
export function ConnectionStatusBadge({ status }: ConnectionStatusBadgeProps) {
  return (
    <Badge variant={VARIANTS[status]}>
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
      {LABELS[status]}
    </Badge>
  );
}
