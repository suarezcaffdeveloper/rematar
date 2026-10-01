/**
 * Lógica pura del detalle de una compra del comprador: armar el "recorrido" de 8 pasos a
 * partir del historial del caso. Sin React ni estado, así se testea sin montar nada.
 */

import { STATUS_ORDER } from './labels';
import type { PostAuctionCaseDetail, PostAuctionStatus, TimelineEntry } from './types';

/** Acciones del historial que el comprador no ve: `notification_failed` es una señal
 * operativa interna (falló un canal de notificación) sin ninguna acción posible de su
 * lado -- mostrarla solo da la impresión de que algo está roto. */
export function isVisibleToBuyer(entry: TimelineEntry): boolean {
  return entry.action !== 'notification_failed';
}

/**
 * Reparte las entradas visibles del historial entre los pasos del proceso: cada una cuelga
 * del paso en el que estaba la compra cuando ocurrió (un cambio de estado pertenece al
 * paso al que entró; una observación u otra acción, al paso vigente en ese momento).
 * Devuelve las entradas de cada paso de la más vieja a la más nueva.
 */
export function groupTimelineByStep(timeline: TimelineEntry[]): Record<PostAuctionStatus, TimelineEntry[]> {
  const groups = Object.fromEntries(STATUS_ORDER.map((status) => [status, [] as TimelineEntry[]])) as Record<
    PostAuctionStatus,
    TimelineEntry[]
  >;
  const chronological = timeline
    .filter(isVisibleToBuyer)
    .sort((a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime());

  let current: PostAuctionStatus = 'adjudicado';
  for (const entry of chronological) {
    if (entry.new_status) current = entry.new_status;
    groups[current].push(entry);
  }
  return groups;
}

/** Campo del caso que guarda la fecha de cada hito, para cuando el historial no la trae. */
const STEP_DATE_FIELDS: Partial<Record<PostAuctionStatus, keyof PostAuctionCaseDetail>> = {
  adjudicado: 'created_at',
  pendiente_contacto: 'contacted_at',
  pago_recibido: 'payment_at',
  enviado: 'shipped_at',
  entregado: 'delivered_at',
  finalizado: 'finalized_at',
};

/** Fecha (ISO 8601) en la que la compra llegó a un paso, o `null` si no se conoce: primero
 * la del cambio de estado en el historial, y si no está, la del campo de hito del caso. */
export function stepDate(detail: PostAuctionCaseDetail, step: PostAuctionStatus): string | null {
  const arrivals = detail.timeline
    .filter((entry) => entry.new_status === step && entry.action !== 'note_added')
    .sort((a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime());
  if (arrivals.length > 0) return arrivals[0].occurred_at;

  const field = STEP_DATE_FIELDS[step];
  return field ? ((detail[field] as string | null) ?? null) : null;
}

/** Nombres a mostrar como responsables: el martillero que operó el remate y, si es otra
 * persona, la empresa dueña. Si la empresa operó ella misma, una sola fila. */
export function getResponsables(detail: PostAuctionCaseDetail): { martillero: string | null; empresa: string | null } {
  const martillero = detail.operador_name ?? detail.empresa_name ?? detail.rematador_name;
  const showEmpresa = Boolean(detail.operador_name) && detail.empresa_name !== detail.operador_name;
  return { martillero: martillero ?? null, empresa: showEmpresa ? (detail.empresa_name ?? null) : null };
}
