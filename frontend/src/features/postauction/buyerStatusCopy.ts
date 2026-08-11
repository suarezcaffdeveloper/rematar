/**
 * Copys orientados al comprador para cada estado del flujo post-remate (rediseño del
 * panel "Detalle de mi compra", `MiCompraDetailPage`). Separado de `labels.ts` a
 * propósito: `labels.ts` espeja el vocabulario neutral que comparten ambos lados
 * (comprador/rematador -- `STATUS_LABELS`, `describeTimelineAction`), mientras que este
 * archivo es texto explicativo en segunda persona, específico de la vista del comprador.
 *
 * No inventa acciones que el comprador todavía no puede hacer (ej. pagar desde la
 * plataforma): solo explica en qué está la compra y qué puede esperar.
 */

import { formatDateTime } from '../../shared/lib/format';
import type { PostAuctionCaseDetail, PostAuctionStatus } from './types';

export interface StatusCopy {
  /** Frase corta debajo del estado, en el header. */
  headline: string;
  /** Título de la card "Qué sigue". */
  nextStepTitle: string;
  /** Explicación de qué está pasando y qué debería esperar/hacer el comprador. */
  nextStepDescription: string;
}

const BASE_COPY: Record<PostAuctionStatus, StatusCopy> = {
  adjudicado: {
    headline: 'Ganaste este lote. Todavía no hay novedades del proceso de pago y entrega.',
    nextStepTitle: 'Compra adjudicada',
    nextStepDescription:
      'La compra fue adjudicada. Próximamente el rematador va a iniciar la gestión de pago y entrega.',
  },
  pendiente_contacto: {
    headline: 'El rematador todavía no se puso en contacto con vos.',
    nextStepTitle: 'Esperando contacto',
    nextStepDescription:
      'El rematador se va a poner en contacto con vos para coordinar los próximos pasos de esta compra.',
  },
  pago_pendiente: {
    headline: 'Tu compra está pendiente de pago.',
    nextStepTitle: 'Pago pendiente',
    nextStepDescription: 'Contactá al rematador para coordinar el pago de esta compra.',
  },
  pago_recibido: {
    headline: 'Tu pago fue registrado correctamente.',
    nextStepTitle: 'Pago recibido',
    nextStepDescription: 'El pago fue registrado. El rematador va a preparar la entrega de tu compra.',
  },
  preparando_entrega: {
    headline: 'El rematador está preparando tu entrega.',
    nextStepTitle: 'Preparando entrega',
    nextStepDescription: 'El rematador está organizando el envío o la entrega de tu compra.',
  },
  enviado: {
    headline: 'Tu compra fue enviada.',
    nextStepTitle: 'Compra enviada',
    nextStepDescription: 'Tu compra está en camino. Si necesitás más información, contactá al rematador.',
  },
  entregado: {
    headline: 'Tu compra fue entregada.',
    nextStepTitle: 'Entrega registrada',
    nextStepDescription: 'La entrega de tu compra ya fue registrada por el rematador.',
  },
  finalizado: {
    headline: 'El proceso de tu compra finalizó con éxito.',
    nextStepTitle: 'Compra finalizada',
    nextStepDescription: 'Esta compra completó todo el proceso post-remate. No queda ninguna acción pendiente.',
  },
};

/** Variante del copy base con fechas hito insertadas cuando están disponibles (ej. "fue
 * enviada el 11 ago") -- mismos campos que ya trae `PostAuctionCaseDetail`, sin pedir
 * nada nuevo al backend. */
export function getStatusCopy(data: PostAuctionCaseDetail): StatusCopy {
  const base = BASE_COPY[data.status];
  if (data.status === 'pago_recibido' && data.payment_at) {
    return {
      ...base,
      nextStepDescription: `Registramos tu pago el ${formatDateTime(data.payment_at)}. El rematador va a preparar la entrega de tu compra.`,
    };
  }
  if (data.status === 'enviado' && data.shipped_at) {
    return {
      ...base,
      nextStepDescription: `Tu compra fue enviada el ${formatDateTime(data.shipped_at)}. Si necesitás más información, contactá al rematador.`,
    };
  }
  if (data.status === 'entregado' && data.delivered_at) {
    return {
      ...base,
      nextStepDescription: `La entrega fue registrada el ${formatDateTime(data.delivered_at)}.`,
    };
  }
  return base;
}
