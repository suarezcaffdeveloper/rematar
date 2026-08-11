import { type KeyboardEvent, type TouchEvent, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import clsx from 'clsx';
import type { LoteImage } from '../types';

export interface LoteCardCarouselProps {
  images: LoteImage[];
  alt: string;
}

/** Distancia mínima en px para interpretar un touch como swipe en vez de un tap -- mismo
 * criterio que `features/sala/components/ImageGallery.tsx`. */
const SWIPE_THRESHOLD_PX = 40;

/**
 * Carrusel de imágenes de un lote dentro de la card expandida de `LoteCard` (rediseño del
 * panel "Detalle del Remate") -- misma lógica de navegación (flechas, teclado, swipe) que
 * `features/sala/components/ImageGallery.tsx`, pero con indicadores tipo "dots" en vez de
 * tira de miniaturas: acá vive dentro de una card compacta que se expande in-place, no en
 * una página dedicada con espacio para una tira completa.
 */
export function LoteCardCarousel({ images, alt }: LoteCardCarouselProps) {
  const sorted = useMemo(() => [...images].sort((a, b) => a.order - b.order), [images]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const selected = sorted[selectedIndex] ?? sorted[0];
  const touchStartXRef = useRef<number | null>(null);

  if (!selected) return null;

  const hasMultiple = sorted.length > 1;

  function goTo(index: number) {
    setSelectedIndex((index + sorted.length) % sorted.length);
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
      onClick={(event) => event.stopPropagation()}
      className={clsx(
        'relative aspect-video w-full touch-pan-y overflow-hidden rounded-xl bg-slate-100',
        hasMultiple && 'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
      )}
    >
      {/* Track deslizante -- mismo enfoque que `features/sala/components/ImageGallery.tsx`:
       * todas las imágenes en fila, `translateX` mueve el track entero a la posición
       * seleccionada en vez de reemplazar el `<img>` de golpe (pedido explícito de
       * pulido visual). `prefers-reduced-motion` (`styles/index.css`) recorta la
       * transición a 0 sin lógica extra acá. */}
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
            onClick={(event) => {
              event.stopPropagation();
              goTo(selectedIndex - 1);
            }}
            aria-label="Imagen anterior"
            className="absolute left-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-slate-900/45 text-white backdrop-blur-sm transition-colors hover:bg-slate-900/65 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <ChevronLeft aria-hidden="true" className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              goTo(selectedIndex + 1);
            }}
            aria-label="Imagen siguiente"
            className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-slate-900/45 text-white backdrop-blur-sm transition-colors hover:bg-slate-900/65 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <ChevronRight aria-hidden="true" className="h-5 w-5" />
          </button>

          <div className="absolute inset-x-0 bottom-2 flex items-center justify-center gap-1.5">
            {sorted.map((image, index) => (
              <button
                key={`${image.url}-${index}`}
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  setSelectedIndex(index);
                }}
                aria-label={`Ver imagen ${index + 1} de ${sorted.length}`}
                aria-current={index === selectedIndex}
                className={clsx(
                  'h-1.5 rounded-full transition-all',
                  index === selectedIndex ? 'w-5 bg-white' : 'w-1.5 bg-white/50 hover:bg-white/75',
                )}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
