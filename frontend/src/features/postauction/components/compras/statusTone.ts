import type { PostAuctionStatus } from '../../types';

/** Color del texto de estado de una compra: ámbar lo que espera el pago, verde el pago
 * recibido, gris lo que ya llegó y azul el resto del proceso. */
export function statusTone(status: PostAuctionStatus): string {
  if (status === 'pago_pendiente') return 'text-warning-700';
  if (status === 'entregado' || status === 'finalizado') return 'text-ink-muted';
  if (status === 'pago_recibido') return 'text-success-700';
  return 'text-brand-700';
}
