import type { OfertaStatus } from './types';

type BadgeVariant = 'brand' | 'success' | 'danger' | 'warning' | 'neutral';

export const OFERTA_STATUS_LABELS: Record<OfertaStatus, string> = {
  accepted: 'Aceptada',
  winning: 'Ganadora',
  outbid: 'Superada',
  rejected: 'Rechazada',
};

export const OFERTA_STATUS_BADGE_VARIANTS: Record<OfertaStatus, BadgeVariant> = {
  accepted: 'success',
  winning: 'success',
  outbid: 'neutral',
  rejected: 'danger',
};
