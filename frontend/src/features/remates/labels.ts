/**
 * Texto y estilo de presentación para los enums del backend -- centralizado acá para
 * que ningún componente tenga que repetir el `switch`/diccionario cada vez que necesita
 * mostrar un estado o una categoría.
 */

import type { LoteStatus, RemateCategory, RemateStatus, VisibleRemateStatus } from './types';

type BadgeVariant = 'brand' | 'success' | 'danger' | 'warning' | 'neutral';

export const STATUS_LABELS: Record<RemateStatus, string> = {
  draft: 'Borrador',
  scheduled: 'Programado',
  live: 'En vivo',
  paused: 'Pausado',
  finished: 'Finalizado',
  cancelled: 'Cancelado',
};

export const STATUS_BADGE_VARIANTS: Record<RemateStatus, BadgeVariant> = {
  draft: 'neutral',
  scheduled: 'brand',
  live: 'warning',
  paused: 'neutral',
  finished: 'success',
  cancelled: 'danger',
};

/** Orden de exhibición para el filtro de estado -- nunca incluye `draft` (ver types.ts). */
export const VISIBLE_STATUS_OPTIONS: VisibleRemateStatus[] = [
  'scheduled',
  'live',
  'paused',
  'finished',
  'cancelled',
];

export const CATEGORY_LABELS: Record<RemateCategory, string> = {
  inmuebles: 'Inmuebles',
  vehiculos: 'Vehículos',
  maquinaria_agricola: 'Maquinaria agrícola',
  hacienda: 'Hacienda',
  arte_y_antiguedades: 'Arte y antigüedades',
  electronica: 'Electrónica',
  mobiliario: 'Mobiliario',
  indumentaria: 'Indumentaria',
  otros: 'Otros',
};

export const CATEGORY_OPTIONS: RemateCategory[] = [
  'inmuebles',
  'vehiculos',
  'maquinaria_agricola',
  'hacienda',
  'arte_y_antiguedades',
  'electronica',
  'mobiliario',
  'indumentaria',
  'otros',
];

export const LOTE_STATUS_LABELS: Record<LoteStatus, string> = {
  pending: 'Pendiente',
  open: 'Abierto',
  closed_sold: 'Vendido',
  closed_unsold: 'Desierto',
  cancelled: 'Cancelado',
};

export const LOTE_STATUS_BADGE_VARIANTS: Record<LoteStatus, BadgeVariant> = {
  pending: 'neutral',
  open: 'warning',
  closed_sold: 'success',
  closed_unsold: 'neutral',
  cancelled: 'danger',
};
