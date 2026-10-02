import clsx from 'clsx';
import { STATUS_LABELS } from '../../labels';
import type { PostAuctionStatus } from '../../types';

const TONES: Record<PostAuctionStatus, string> = {
  adjudicado: 'bg-brand-50 text-brand-700',
  pendiente_contacto: 'bg-warning-50 text-warning-700',
  pago_pendiente: 'bg-warning-50 text-warning-700',
  pago_recibido: 'bg-success-50 text-success-700',
  preparando_entrega: 'bg-brand-50 text-brand-700',
  enviado: 'bg-brand-50 text-brand-700',
  entregado: 'bg-success-50 text-success-700',
  finalizado: 'bg-slate-100 text-slate-700',
};

/** Estado de una venta como píldora -- misma familia visual que `RemateStatusPill` del panel
 * principal. Siempre lleva el texto del estado: nunca se comunica solo con color. */
export function SaleStatusPill({ status, className }: { status: PostAuctionStatus; className?: string }) {
  return (
    <span
      className={clsx('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold', TONES[status], className)}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

/** "Atrasada": píldora roja con el motivo ("Pago pendiente hace 6 días"). */
export function LatePill({ text, className }: { text: string; className?: string }) {
  return (
    <span className={clsx('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-danger-50 px-2.5 py-1 text-xs font-semibold text-danger-600', className)}>
      {text}
    </span>
  );
}
