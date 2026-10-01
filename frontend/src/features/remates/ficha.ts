/**
 * Lógica pura de la ficha de un remate (`RemateDetailPage`): qué fotos van en la portada,
 * cómo se ordenan las de cada lote, qué estados se pueden filtrar y cómo se nombra la
 * garantía. Sin React, así se testea sin montar nada.
 */

import { formatCurrency } from '../../shared/lib/format';
import type { Lote, LoteImage, LoteStatus, Remate } from './types';

/** Imágenes del lote en su orden de exhibición (`order`). */
export function sortedImages(lote: Pick<Lote, 'images'>): LoteImage[] {
  return [...lote.images].sort((a, b) => a.order - b.order);
}

export const HERO_PHOTO_COUNT = 3;

/**
 * Fotos del mosaico de la portada: la portada propia del remate (`cover_image_url`) si
 * tiene y, después, la primera foto de los primeros lotes -- hasta `HERO_PHOTO_COUNT`,
 * sin repetir una misma URL. Vacío si ni el remate ni sus lotes tienen fotos.
 */
export function heroPhotos(remate: Pick<Remate, 'cover_image_url'>, lotes: Pick<Lote, 'images'>[]): string[] {
  const urls: string[] = [];
  const add = (url: string | undefined | null) => {
    if (url && !urls.includes(url) && urls.length < HERO_PHOTO_COUNT) urls.push(url);
  };
  add(remate.cover_image_url);
  for (const lote of lotes) add(sortedImages(lote)[0]?.url);
  return urls;
}

/** Estados de lote por los que se puede filtrar, en el orden en que se ofrecen. */
export const FILTERABLE_LOTE_STATUSES: LoteStatus[] = ['open', 'pending', 'closed_sold', 'closed_unsold', 'cancelled'];

/** Cuántos lotes hay en cada estado. */
export function countByStatus(lotes: Pick<Lote, 'status'>[]): Map<LoteStatus, number> {
  const counts = new Map<LoteStatus, number>();
  for (const lote of lotes) counts.set(lote.status, (counts.get(lote.status) ?? 0) + 1);
  return counts;
}

/** Color del texto del estado de un lote. */
export const LOTE_STATUS_TONE: Record<LoteStatus, string> = {
  pending: 'text-brand-700',
  open: 'text-success-700',
  closed_sold: 'text-ink-muted',
  closed_unsold: 'text-ink-faint',
  cancelled: 'text-danger-600',
};

/** Texto de la garantía para ofertar: el monto si hay, "Requerida" si se exige sin monto
 * configurado, o "No se requiere garantía". */
export function guaranteeLabel(settings: Remate['settings']): string {
  if (!settings.guarantee_required) return 'No se requiere garantía';
  return settings.guarantee_amount ? formatCurrency(settings.guarantee_amount, settings.currency) : 'Requerida';
}
