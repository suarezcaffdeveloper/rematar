import { type KeyboardEvent, type TouchEvent, useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import clsx from 'clsx';
import { CoverPlaceholder } from '../../remates/components/CoverPlaceholder';
import { BoxIcon } from '../../remates/components/icons';
import type { LoteImage } from '../../remates/types';

export interface ImageGalleryMainProps {
  sorted: LoteImage[];
  selectedIndex: number;
  selected: LoteImage | undefined;
  hasMultiple: boolean;
  goTo: (index: number) => void;
  alt: string;
  aspectClassName?: string;
  className?: string;
}

/** Distancia mínima en px para interpretar un touch como swipe en vez de un tap --
 * evita que un toque tembloroso dispare un cambio de imagen no intencional. */
const SWIPE_THRESHOLD_PX = 40;

/**
 * Solo la imagen principal (con flechas de navegación y swipe táctil), sin la tira de
 * miniaturas -- extraído de `ImageGallery` para que la Sala del comprador
 * (`ActiveLotePanel`) pueda ubicar la tira de miniaturas en otro lugar del layout (más
 * abajo, junto al título/descripción) sin que eso afecte el tamaño de esta imagen: acá
 * no vive ningún `useImageGallery` propio, el índice seleccionado se recibe por props
 * (controlado desde afuera) para que ambas piezas -- esta imagen y `ImageGalleryThumbnails`
 * -- comparta un único estado sin quedar anidadas en el DOM. `ImageGallery` sigue siendo
 * el combo imagen+miniaturas de siempre (Consola Operativa del rematador): por dentro
 * llama al hook y compone esta pieza más `ImageGalleryThumbnails`, una al lado de la otra.
 */
export function ImageGalleryMain({
  sorted,
  selectedIndex,
  selected,
  hasMultiple,
  goTo,
  alt,
  aspectClassName = 'aspect-video',
  className,
}: ImageGalleryMainProps) {
  const touchStartXRef = useRef<number | null>(null);

  if (!selected) {
    return (
      <CoverPlaceholder
        className={clsx(aspectClassName, className, 'w-full rounded-xl')}
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
        className,
        hasMultiple && 'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
      )}
    >
      {/* Track deslizante (en vez de reemplazar el `<img>` de golpe): todas las
       * imágenes van una al lado de la otra en fila, `translateX` mueve el track
       * entero a la posición seleccionada -- transición suave al pasar de foto,
       * pedido explícito en vez del corte abrupto que había antes. La regla global
       * de `prefers-reduced-motion` (`styles/index.css`) ya recorta esta transición
       * a 0 para quien lo prefiere, sin lógica extra acá.
       *
       * `object-contain` en vez de `object-cover` en cada `<img>`: las fotos que
       * suben rematadores/empresas no vienen todas en 16:9 (el aspect ratio del
       * contenedor), y recortar para llenar el marco cortaba el techo/piso de fotos
       * verticales -- acá siempre se ve la foto completa, con el `bg-slate-100` del
       * contenedor de afuera como relleno neutro (letterbox) en vez de robar imagen.
       * Las miniaturas (`ImageGalleryThumbnails`) siguen en `object-cover` a propósito:
       * son solo puntos de navegación pequeños, no necesitan mostrar el encuadre
       * completo. */}
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
            className="h-full w-full shrink-0 object-contain"
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
