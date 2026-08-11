import { useMemo, useState } from 'react';
import type { LoteImage } from '../../remates/types';

export interface UseImageGalleryResult {
  sorted: LoteImage[];
  selectedIndex: number;
  selected: LoteImage | undefined;
  hasMultiple: boolean;
  goTo: (index: number) => void;
}

/**
 * Estado de "cuál imagen del lote está seleccionada" (orden + índice actual), extraído
 * de `ImageGallery` -- tanto `ImageGallery` (imagen + miniaturas juntas, Consola
 * Operativa del rematador) como `LoteHeroImage` (solo la imagen principal, Sala del
 * comprador) llaman a este mismo hook por dentro en vez de duplicar el `useState`/sort.
 * Cada uno sigue dueño de su propio índice -- quien lo usa se remonta con
 * `key={lote.id}` al cambiar de lote, mismo patrón de siempre.
 */
export function useImageGallery(images: LoteImage[]): UseImageGalleryResult {
  const sorted = useMemo(() => [...images].sort((a, b) => a.order - b.order), [images]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const selected = sorted[selectedIndex] ?? sorted[0];

  function goTo(index: number) {
    setSelectedIndex((index + sorted.length) % sorted.length);
  }

  return { sorted, selectedIndex, selected, hasMultiple: sorted.length > 1, goTo };
}
