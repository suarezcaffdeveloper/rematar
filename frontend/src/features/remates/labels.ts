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

/** El estado se comunica únicamente a través de este badge -- la tarjeta que lo
 * envuelve (`RemateCard`/`RematadorRemateCard`) mantiene siempre el mismo borde neutro,
 * igual que el resto de las cards del rediseño (`LoteCard`, `FinishedRemateCard`,
 * `CaseCard`), en vez de duplicar la señal de color en el borde. */
export const STATUS_BADGE_VARIANTS: Record<RemateStatus, BadgeVariant> = {
  draft: 'neutral',
  scheduled: 'brand',
  live: 'success',
  paused: 'neutral',
  finished: 'neutral',
  cancelled: 'danger',
};

/** Borde + sombra neutro y estático de la tarjeta de un remate -- mismo tratamiento que
 * `LoteCard`/`FinishedRemateCard`/`CaseCard` en todo estado, para que el color quede
 * reservado al badge de estado (ver `STATUS_BADGE_VARIANTS`). */
export const STATUS_CARD_ACCENT = 'border-line shadow-sm hover:border-line-strong hover:shadow-xl';

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
  vehiculos: 'Automotores y vehículos',
  maquinaria_pesada_y_agricola: 'Maquinaria pesada y agrícola',
  hacienda: 'Hacienda y ganadería',
  arte_antiguedades_y_coleccionables: 'Arte - Antigüedades - Coleccionables',
  joyas_relojeria_y_numismatica: 'Joyas - Relojería - Numismática',
  tecnologia_electrodomesticos_y_hogar: 'Tecnología - Electrodomésticos - Hogar',
  nautica_y_aviacion: 'Náutica y aviación',
  mercaderia_e_indumentaria: 'Lotes de mercadería e indumentaria',
};

export const CATEGORY_OPTIONS: RemateCategory[] = [
  'inmuebles',
  'vehiculos',
  'maquinaria_pesada_y_agricola',
  'hacienda',
  'arte_antiguedades_y_coleccionables',
  'joyas_relojeria_y_numismatica',
  'tecnologia_electrodomesticos_y_hogar',
  'nautica_y_aviacion',
  'mercaderia_e_indumentaria',
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
