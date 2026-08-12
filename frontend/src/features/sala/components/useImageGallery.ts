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
 * Estado de "cuál imagen del lote está seleccionada" (orden + índice actual), que usa
 * `ImageGallery` (imagen + miniaturas juntas, Consola Operativa del rematador) y, por
 * separado, `ImageGalleryMain` + `ImageGalleryThumbnails` (Sala del comprador,
 * `ActiveLotePanel`, que las ubica en dos puntos distintos del layout controlando ambas
 * desde este mismo hook). `ActiveLotePanel` no se remonta al cambiar de lote activo (el
 * `lote` le llega como prop nueva, no via `key`) -- por eso el índice se resetea a 0 acá
 * mismo, comparando la key de imágenes contra la del render anterior (patrón de React de
 * "ajustar estado cuando cambia una prop", en vez de depender de que quien llama se
 * remonte con `key={lote.id}`, que además de innecesario ahora sería insuficiente).
 */
export function useImageGallery(images: LoteImage[]): UseImageGalleryResult {
  const sorted = useMemo(() => [...images].sort((a, b) => a.order - b.order), [images]);
  const imagesKey = sorted.map((image) => image.url).join('|');

  const [previousImagesKey, setPreviousImagesKey] = useState(imagesKey);
  const [selectedIndex, setSelectedIndex] = useState(0);
  if (imagesKey !== previousImagesKey) {
    setPreviousImagesKey(imagesKey);
    setSelectedIndex(0);
  }

  const selected = sorted[selectedIndex] ?? sorted[0];

  function goTo(index: number) {
    setSelectedIndex((index + sorted.length) % sorted.length);
  }

  return { sorted, selectedIndex, selected, hasMultiple: sorted.length > 1, goTo };
}
