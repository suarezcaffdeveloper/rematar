/**
 * Texto y color de presentación para `RecentAnalyticsEventType` (Épica 7, Módulo 7.1).
 * Reusa `LOTE_STATUS_BADGE_VARIANTS` (`features/remates/labels.ts`) para los dos tipos
 * que ya tienen un color establecido en el resto de la app (`closed_sold`/
 * `closed_unsold`) -- no se reinventa esa paleta acá.
 */

import { LOTE_STATUS_BADGE_VARIANTS } from '../remates/labels';
import type { RecentAnalyticsEventType } from './types';

type BadgeVariant = 'brand' | 'success' | 'danger' | 'warning' | 'neutral';

export const RECENT_EVENT_LABELS: Record<RecentAnalyticsEventType, string> = {
  'lote.opened': 'Lote abierto',
  'lote.closed_sold': 'Lote vendido',
  'lote.closed_unsold': 'Lote desierto',
  'remate.finished': 'Remate finalizado',
  'remate.cancelled': 'Remate cancelado',
};

export const RECENT_EVENT_BADGE_VARIANTS: Record<RecentAnalyticsEventType, BadgeVariant> = {
  'lote.opened': 'warning', // mismo color que LOTE_STATUS_BADGE_VARIANTS.open
  'lote.closed_sold': LOTE_STATUS_BADGE_VARIANTS.closed_sold,
  'lote.closed_unsold': LOTE_STATUS_BADGE_VARIANTS.closed_unsold,
  'remate.finished': 'success',
  'remate.cancelled': 'danger',
};
