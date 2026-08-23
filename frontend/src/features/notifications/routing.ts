/**
 * Resuelve a dónde debe navegar un clic sobre una notificación. Regla: siempre el
 * recurso MÁS ESPECÍFICO que la notificación ya trae (`resource_type`/`resource_id`),
 * nunca el remate general como destino por defecto -- `remate_id` es el último fallback,
 * para notificaciones sin recurso propio (ej. moderación, que sí es un evento de remate).
 *
 * Los tres tipos que hoy emite el backend (`app/postauction/service.py`,
 * `app/moderation/service.py`):
 * - `postauction.case_created`, resource_type="postauction_case": para el comprador que
 *   ganó, el recurso relacionado es su lista de compras (no el detalle puntual); para la
 *   empresa dueña del remate (misma `type`, notificación separada; antes de ADR-047 este
 *   destinatario era el rol `rematador`), es la venta adjudicada puntual.
 * - `postauction.status_changed`, resource_type="postauction_case": siempre al comprador
 *   dueño del caso -> detalle de esa compra puntual.
 * - `moderacion.*`, resource_type="remate": no tiene recurso más específico que el
 *   remate mismo.
 */
import type { UserRole } from '../auth/types';
import type { Notification } from './types';

export function notificationHref(notification: Notification, role: UserRole | undefined): string | null {
  const { type, resource_type: resourceType, resource_id: resourceId, remate_id: remateId } = notification;

  if (resourceType === 'postauction_case' && resourceId) {
    if (type === 'postauction.case_created' && role !== 'empresa') {
      return '/mis-compras';
    }
    return role === 'empresa' ? `/ventas-adjudicadas/${resourceId}` : `/mis-compras/${resourceId}`;
  }

  if (remateId) {
    return `/remates/${remateId}`;
  }

  return null;
}
