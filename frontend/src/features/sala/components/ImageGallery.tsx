import clsx from 'clsx';
import type { LoteImage } from '../../remates/types';
import { ImageGalleryMain } from './ImageGalleryMain';
import { ImageGalleryThumbnails } from './ImageGalleryThumbnails';
import { useImageGallery } from './useImageGallery';

export interface ImageGalleryProps {
  images: LoteImage[];
  alt: string;
  /** Clase de aspect ratio del contenedor principal -- `aspect-video` (16:9) por
   * default, igual que siempre. La Consola Operativa del rematador pasa una relación más
   * baja (rediseño "Modo Remate"): a diferencia de la Sala del comprador, donde la imagen
   * es el elemento protagonista, el rematador prioriza la operación por sobre la media,
   * así que su columna de lote ocupa menos alto. */
  aspectClassName?: string;
  /** Clase para el contenedor raíz (imagen + miniaturas). */
  className?: string;
}

/**
 * Imagen principal + tira de miniaturas clickeables, con flechas de navegación y
 * swipe táctil (mejora visual, sin cambios de datos -- pulido a partir de pruebas de
 * usuario: antes solo se podía cambiar de imagen clickeando una miniatura, sin forma de
 * recorrerlas desde la imagen principal). El estado de "cuál imagen está seleccionada"
 * vive ACÁ (vía `useImageGallery`) y se pasa como props a `ImageGalleryMain` +
 * `ImageGalleryThumbnails`, que son las que hacen el render real -- separadas en sus
 * propios componentes para que la Sala del comprador (`ActiveLotePanel`) pueda usarlas
 * sueltas, ubicando la tira de miniaturas en otra parte del layout (junto al
 * título/descripción, no pegada a la imagen) sin que el tamaño de la imagen dependa de
 * eso. Este componente (`ImageGallery`) sigue siendo el combo de siempre para quien no
 * necesita esa separación -- hoy, la Consola Operativa del rematador (`ConsolaLotePanel`).
 */
export function ImageGallery({ images, alt, aspectClassName = 'aspect-video', className }: ImageGalleryProps) {
  const { sorted, selectedIndex, selected, hasMultiple, goTo } = useImageGallery(images);

  return (
    <div className={clsx('flex flex-col gap-3', className)}>
      <ImageGalleryMain
        sorted={sorted}
        selectedIndex={selectedIndex}
        selected={selected}
        hasMultiple={hasMultiple}
        goTo={goTo}
        alt={alt}
        aspectClassName={aspectClassName}
      />
      <ImageGalleryThumbnails sorted={sorted} selectedIndex={selectedIndex} hasMultiple={hasMultiple} goTo={goTo} />
    </div>
  );
}
