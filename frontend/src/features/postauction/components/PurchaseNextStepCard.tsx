import {
  CheckCircleIcon,
  CreditCardIcon,
  GavelIcon,
  HandshakeIcon,
  PackageIcon,
  PartyPopperIcon,
  TruckIcon,
} from '../../remates/components/icons';
import { getStatusCopy } from '../buyerStatusCopy';
import type { PostAuctionCaseDetail, PostAuctionStatus } from '../types';

export interface PurchaseNextStepCardProps {
  data: PostAuctionCaseDetail;
}

const STATUS_ICONS: Record<PostAuctionStatus, typeof GavelIcon> = {
  adjudicado: GavelIcon,
  pendiente_contacto: HandshakeIcon,
  pago_pendiente: CreditCardIcon,
  pago_recibido: CheckCircleIcon,
  preparando_entrega: PackageIcon,
  enviado: TruckIcon,
  entregado: CheckCircleIcon,
  finalizado: PartyPopperIcon,
};

/**
 * "Qué sigue" (sección 6 del pedido) -- la pregunta que el comprador se hace al entrar:
 * qué está pasando y si hay algo que deba hacer. Texto puramente informativo
 * (`getStatusCopy`): no ofrece ninguna acción que el comprador todavía no pueda realizar
 * en la plataforma (ej. no hay botón de "Pagar" -- esa funcionalidad no existe hoy).
 */
export function PurchaseNextStepCard({ data }: PurchaseNextStepCardProps) {
  const Icon = STATUS_ICONS[data.status];
  const copy = getStatusCopy(data);

  return (
    <div className="rounded-xl border border-brand-100 bg-brand-50/40 p-6 shadow-sm">
      <div className="flex items-start gap-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-brand-600 shadow-sm ring-1 ring-inset ring-brand-100">
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-brand-700">Qué sigue</h2>
          <p className="mt-1 text-base font-semibold text-slate-900">{copy.nextStepTitle}</p>
          <p className="mt-1 text-sm leading-relaxed text-slate-600">{copy.nextStepDescription}</p>
        </div>
      </div>
    </div>
  );
}
