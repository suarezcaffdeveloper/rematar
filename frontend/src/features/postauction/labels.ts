/**
 * Etiquetas humanas y orden del flujo post-remate (Épica 7, Módulo 7.5) -- espeja
 * `backend/app/postauction/state_machine.py::STATUS_ORDER`. El backend es quien valida
 * las transiciones (`assert_transition_allowed`); acá solo se usa el mismo orden para
 * calcular "qué estados siguientes ofrecer" y para el indicador visual de progreso.
 */

import type { PostAuctionStatus } from './types';

export const STATUS_ORDER: PostAuctionStatus[] = [
  'adjudicado',
  'pendiente_contacto',
  'pago_pendiente',
  'pago_recibido',
  'preparando_entrega',
  'enviado',
  'entregado',
  'finalizado',
];

export const STATUS_LABELS: Record<PostAuctionStatus, string> = {
  adjudicado: 'Adjudicado',
  pendiente_contacto: 'Pendiente de contacto',
  pago_pendiente: 'Pago pendiente',
  pago_recibido: 'Pago recibido',
  preparando_entrega: 'Preparando entrega',
  enviado: 'Enviado',
  entregado: 'Entregado',
  finalizado: 'Finalizado',
};

export type BadgeVariant = 'brand' | 'success' | 'danger' | 'warning' | 'neutral';

export const STATUS_BADGE_VARIANTS: Record<PostAuctionStatus, BadgeVariant> = {
  adjudicado: 'brand',
  pendiente_contacto: 'warning',
  pago_pendiente: 'warning',
  pago_recibido: 'success',
  preparando_entrega: 'brand',
  enviado: 'brand',
  entregado: 'success',
  finalizado: 'neutral',
};

/** Estados posteriores al actual, en orden -- las únicas opciones válidas para "Cambiar
 * estado" (el backend rechaza cualquier otra con 422, esto solo evita ofrecerlas). */
export function nextStatusOptions(current: PostAuctionStatus): PostAuctionStatus[] {
  const index = STATUS_ORDER.indexOf(current);
  return STATUS_ORDER.slice(index + 1);
}

const ACTION_LABELS: Record<string, string> = {
  case_created: 'Caso creado (lote adjudicado)',
  status_changed: 'Cambio de estado',
  note_added: 'Observación agregada',
};

export function describeTimelineAction(action: string): string {
  return ACTION_LABELS[action] ?? action;
}
