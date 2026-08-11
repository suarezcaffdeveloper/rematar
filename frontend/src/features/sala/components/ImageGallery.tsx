import { type KeyboardEvent, type TouchEvent, useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import clsx from 'clsx';
import { CoverPlaceholder } from '../../remates/components/CoverPlaceholder';
import { BoxIcon } from '../../remates/components/icons';
import type { LoteImage } from '../../remates/types';
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
}

/** Distancia mínima en px para interpretar un touch como swipe en vez de un tap --
 * evita que un toque tembloroso dispare un cambio de imagen no intencional. */
const SWIPE_THRESHOLD_PX = 40;

/**
 * Imagen principal + tira de miniaturas clickeables, con flechas de navegación y
 * swipe táctil (mejora visual, sin cambios de datos -- pulido a partir de pruebas de
 * usuario: antes solo se podía cambiar de imagen clickeando una miniatura, sin forma de
 * recorrerlas desde la imagen principal). El estado de "cuál imagen está seleccionada"
 * vive ACÁ, no en `SalaPage` ni en `ActiveLotePanel` -- cambiar de imagen solo vuelve a
 * renderizar este componente, nunca la cabecera ni el panel lateral de ofertas
 * (optimización de renderizado por colocación de estado, ver docs/27-sala-del-remate.md,
 * "Optimización del renderizado").
 */
export function ImageGallery({ images, alt, aspectClassName = 'aspect-video' }: ImageGalleryProps) {
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
    <div className="flex flex-col gap-3">
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
        {/* Track deslizante (en vez de reemplazar el `<img>` de golpe): todas las
         * imágenes van una al lado de la otra en fila, `translateX` mueve el track
         * entero a la posición seleccionada -- transición suave al pasar de foto,
         * pedido explícito en vez del corte abrupto que había antes. La regla global
         * de `prefers-reduced-motion` (`styles/index.css`) ya recorta esta transición
         * a 0 para quien lo prefiere, sin lógica extra acá. */}
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

      {hasMultiple && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {sorted.map((image, index) => (
            <button
              key={`${image.url}-${index}`}
              type="button"
              onClick={() => goTo(index)}
              aria-label={`Ver imagen ${index + 1} de ${sorted.length}`}
              aria-current={index === selectedIndex}
              className={clsx(
                'h-16 w-24 shrink-0 overflow-hidden rounded-lg border-2 transition-colors',
                index === selectedIndex ? 'border-brand-600' : 'border-transparent hover:border-slate-300',
              )}
            >
              <img src={image.url} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
