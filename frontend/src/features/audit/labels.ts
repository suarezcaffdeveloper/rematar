/**
 * Etiquetas humanas para el namespace abierto de acciones (`backend/app/audit/
 * actions.py::AuditAction`) -- mismo criterio que `features/chat/labels.ts`/`features/
 * analytics/labels.ts`: el backend guarda el string crudo (`"remate.created"`), el
 * frontend decide cómo mostrarlo. Una acción sin entrada acá no rompe nada -- `describeAction`
 * devuelve el string crudo como fallback, así que sumar una acción nueva en el backend
 * (ver docstring de `actions.py`) nunca requiere tocar este archivo para que el panel
 * siga funcionando; solo hace falta para que se vea prolijo.
 */

export interface AuditActionLabel {
  label: string;
  /** Mismas variantes que `Badge` (`shared/components/Badge.tsx`). */
  variant: 'brand' | 'success' | 'danger' | 'warning' | 'neutral';
}

const ACTION_LABELS: Record<string, AuditActionLabel> = {
  'auth.login': { label: 'Inicio de sesión', variant: 'neutral' },
  'auth.logout': { label: 'Cierre de sesión', variant: 'neutral' },
  'remate.created': { label: 'Remate creado', variant: 'brand' },
  'remate.updated': { label: 'Remate modificado', variant: 'neutral' },
  'remate.settings_changed': { label: 'Configuración del remate modificada', variant: 'warning' },
  'remate.deleted': { label: 'Remate eliminado', variant: 'danger' },
  'remate.status_changed': { label: 'Cambio de estado del remate', variant: 'brand' },
  'lote.created': { label: 'Lote creado', variant: 'brand' },
  'lote.updated': { label: 'Lote modificado', variant: 'neutral' },
  'lote.deleted': { label: 'Lote eliminado', variant: 'danger' },
  'lote.opened': { label: 'Lote abierto', variant: 'brand' },
  'lote.closed': { label: 'Lote cerrado (sin vender)', variant: 'neutral' },
  'lote.awarded': { label: 'Lote adjudicado', variant: 'success' },
  'lote.cancelled': { label: 'Lote cancelado', variant: 'danger' },
  'oferta.placed': { label: 'Oferta realizada', variant: 'success' },
  'oferta.rejected': { label: 'Oferta rechazada', variant: 'warning' },
  'chat.message_deleted': { label: 'Mensaje de chat eliminado', variant: 'danger' },
};

export function describeAction(action: string): AuditActionLabel {
  return ACTION_LABELS[action] ?? { label: action, variant: 'neutral' };
}

const RESOURCE_TYPE_LABELS: Record<string, string> = {
  remate: 'Remate',
  lote: 'Lote',
  oferta: 'Oferta',
  chat_message: 'Mensaje de chat',
  user: 'Usuario',
};

export function describeResourceType(resourceType: string): string {
  return RESOURCE_TYPE_LABELS[resourceType] ?? resourceType;
}

/** Opciones del `<select>` de filtro por acción -- lista fija y curada (no uno por cada
 * valor posible), mismo criterio que `CATEGORY_LABELS`/`STATUS_LABELS` de `features/
 * remates/labels.ts` alimentan sus propios `<select>`. */
export const ACTION_FILTER_OPTIONS: string[] = Object.keys(ACTION_LABELS);
