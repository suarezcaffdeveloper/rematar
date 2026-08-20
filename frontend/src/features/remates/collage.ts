import type { Lote } from './types';

/**
 * Primera imagen (menor `order`) de cada lote, en el orden de exhibición del remate
 * (`display_order` -- `lotes` ya viene ordenado así desde el backend, ver
 * `lotes/repository.py`). Usada por `LotesCollagePlaceholder` para armar un collage de
 * portada cuando el remate no tiene `cover_image_url` propio: la idea es la misma que
 * una portada de playlist armada con las canciones que contiene.
 *
 * Lotes sin ninguna imagen se saltean (no hay nada que mostrar en esa celda) en vez de
 * dejar un hueco -- se corta en `limit` imágenes encontradas, no en `limit` lotes
 * recorridos.
 */
export function pickLoteCoverImages(lotes: Lote[], limit = 4): string[] {
  const images: string[] = [];
  for (const lote of lotes) {
    if (images.length >= limit) break;
    const [first] = [...lote.images].sort((a, b) => a.order - b.order);
    if (first) images.push(first.url);
  }
  return images;
}
