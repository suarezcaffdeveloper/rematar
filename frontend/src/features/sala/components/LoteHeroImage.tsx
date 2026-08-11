import { type KeyboardEvent, type TouchEvent, useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import clsx from 'clsx';
import { CoverPlaceholder } from '../../remates/components/CoverPlaceholder';
import { BoxIcon } from '../../remates/components/icons';
import type { LoteImage } from '../../remates/types';
import { useImageGallery } from './useImageGallery';

export interface LoteHeroImageProps {
  images: LoteImage[];
  alt: string;
  /** `aspect-video` (16:9) por default -- la Sala del comprador (rediseño "info a la
   * izquierda, ofertar a la derecha") le pasa además un `max-h` para achicarla un poco,
   * ver `ActiveLotePanel`. */
  aspectClassName?: string;
}

/** Distancia mínima en px para interpretar un touch como swipe en vez de un tap. */
const SWIPE_THRESHOLD_PX = 40;

/**
 * Solo la imagen principal del lote, con flechas de navegación y swipe táctil -- sin la
 * tira de miniaturas que tenía `ImageGallery` (de la que sale este componente, Sala del
 * comprador, rediseño "info a la izquierda, ofertar a la derecha"). Pedido explícito:
 * las miniaturas quedaban de más -- para ver todas las fotos alcanza con deslizar/usar
 * las flechas de acá, no hace falta un segundo control redundante debajo.
 *
 * `ImageGallery` (Consola Operativa del rematador) sigue con imagen + miniaturas juntas
 * sin cambios -- esto es específico de la Sala.
 */
export function LoteHeroImage({ images, alt, aspectClassName = 'aspect-video' }: LoteHeroImageProps) {
  const { sorted, selectedIndex, selected, hasMultiple, goTo } = useImageGallery(images);
  const touchStartXRef = useRef<number | null>(null);

  if (!selected) {
    return (
      <CoverPlaceholder
        className={clsx(aspectClassName, 'w-full rounded-xl')}
        icon={<BoxIcon className="h-12 w-12 text-brand-300" />}
      />
    );
  }

  function handleTouchStart(event: TouchEvent<HTMLDivElement>) {
    touchStartXRef.current = event.touches[0]?.clientX ?? null;
  }

  function handleTouchEnd(event: TouchEvent<HTMLDivElement>) {
    const startX = touchStartXRef.current;
    touchStartXRef.current = null;
    if (startX === null) return;
    const deltaX = event.changedTouches[0]?.clientX - startX;
    if (Math.abs(deltaX) < SWIPE_THRESHOLD_PX) return;
    goTo(selectedIndex + (deltaX < 0 ? 1 : -1));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'ArrowRight') goTo(selectedIndex + 1);
    else if (event.key === 'ArrowLeft') goTo(selectedIndex - 1);
  }

  return (
    <div
      role="group"
      aria-label={`Galería de imágenes -- ${alt}`}
      aria-roledescription="carrusel"
      tabIndex={hasMultiple ? 0 : undefined}
      onKeyDown={hasMultiple ? handleKeyDown : undefined}
      onTouchStart={hasMultiple ? handleTouchStart : undefined}
      onTouchEnd={hasMultiple ? handleTouchEnd : undefined}
      className={clsx(
        'relative w-full touch-pan-y overflow-hidden rounded-xl bg-slate-100',
        aspectClassName,
        hasMultiple && 'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
      )}
    >
      <div
        className="flex h-full w-full transition-transform duration-300 ease-out"
        style={{ transform: `translateX(-${selectedIndex * 100}%)` }}
      >
        {sorted.map((image, index) => (
          <img
            key={`${image.url}-${index}`}
            src={image.url}
            alt={index === selectedIndex ? (image.caption ?? alt) : ''}
            aria-hidden={index !== selectedIndex}
            className="h-full w-full shrink-0 object-cover"
          />
        ))}
      </div>

      {hasMultiple && (
        <>
          <button
            type="button"
            onClick={() => goTo(selectedIndex - 1)}
            aria-label="Imagen anterior"
            className="absolute left-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-slate-900/45 text-white backdrop-blur-sm transition-colors hover:bg-slate-900/65 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <ChevronLeft aria-hidden="true" className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => goTo(selectedIndex + 1)}
            aria-label="Imagen siguiente"
            className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-slate-900/45 text-white backdrop-blur-sm transition-colors hover:bg-slate-900/65 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <ChevronRight aria-hidden="true" className="h-5 w-5" />
          </button>

          <span className="absolute bottom-2 right-2 rounded-full bg-slate-900/55 px-2 py-0.5 text-xs font-medium text-white backdrop-blur-sm">
            {selectedIndex + 1} / {sorted.length}
          </span>
        </>
      )}
    </div>
  );
}
