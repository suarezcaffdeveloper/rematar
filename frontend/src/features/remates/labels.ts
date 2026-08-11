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

/** Mismos colores que `STATUS_CARD_ACCENT` (más abajo): en vivo = verde, programado =
 * azul, finalizado = gris -- para que la nube de estado y el borde de la tarjeta se
 * lean como una sola señal, no dos criterios de color distintos. */
export const STATUS_BADGE_VARIANTS: Record<RemateStatus, BadgeVariant> = {
  draft: 'neutral',
  scheduled: 'brand',
  live: 'success',
  paused: 'neutral',
  finished: 'neutral',
  cancelled: 'danger',
};

/**
 * Borde + sombra de la tarjeta de un remate según su estado -- refuerzo visual para
 * distinguir de un vistazo un remate en vivo (verde), programado (azul) o finalizado
 * (gris), tanto en el Dashboard del Rematador (`RematadorRemateCard`) como en el del
 * comprador (`RemateCard`). `draft`/`paused`/`cancelled` no fueron pedidos y se quedan
 * con el borde neutro de siempre.
 */
export const STATUS_CARD_ACCENT: Record<RemateStatus, string> = {
  draft: 'border-slate-200 hover:border-slate-300 shadow-sm hover:shadow-xl',
  scheduled:
    'border-brand-200 shadow-sm shadow-brand-500/10 hover:border-brand-300 hover:shadow-xl hover:shadow-brand-500/15',
  live: 'border-success-300 shadow-md shadow-success-500/15 hover:border-success-400 hover:shadow-xl hover:shadow-success-500/20',
  paused: 'border-slate-200 hover:border-slate-300 shadow-sm hover:shadow-xl',
  finished: 'border-slate-300 shadow-sm shadow-slate-400/10 hover:border-slate-400 hover:shadow-xl',
  cancelled: 'border-slate-200 hover:border-slate-300 shadow-sm hover:shadow-xl',
};

/** Orden de exhibición para el filtro de estado -- nunca incluye `draft` (ver types.ts). */
export const VISIBLE_STATUS_OPTIONS: VisibleRemateStatus[] = [
  'scheduled',
  'live',
  'paused',
  'finished',
  'cancelled',
];

/** Igual que `VISIBLE_STATUS_OPTIONS`, pero con `draft` -- para el Dashboard del
 * Rematador (Épica 5, Módulo 5.1), donde el propio dueño sí necesita filtrar sus
 * borradores. Nunca usado por `CompradorDashboardPage`. */
export const ALL_STATUS_OPTIONS: RemateStatus[] = ['draft', ...VISIBLE_STATUS_OPTIONS];

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
