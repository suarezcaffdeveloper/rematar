import clsx from 'clsx';
import { CoverPlaceholder } from './CoverPlaceholder';

export interface LotesCollagePlaceholderProps {
  /** Hasta 4 URLs (`pickLoteCoverImages`), ya en el orden en que se quieren mostrar.
   * Opcional (`[]` por defecto) para que un consumidor que todavía no tiene el dato
   * (ej. un mock de test sin actualizar) caiga al degradé genérico en vez de romper. */
  images?: string[];
  className?: string;
}

function gridClass(count: number): string {
  if (count <= 1) return 'grid-cols-1 grid-rows-1';
  if (count === 2) return 'grid-cols-2 grid-rows-1';
  return 'grid-cols-2 grid-rows-2';
}

/**
 * Portada alternativa de un remate sin `cover_image_url` propio: en vez del degradé
 * genérico de `CoverPlaceholder`, un collage con la primera imagen de hasta 4 lotes --
 * mismo criterio que una portada de playlist armada con las canciones que contiene. Sin
 * imágenes de lote disponibles, cae al mismo `CoverPlaceholder` de siempre: no hay nada
 * de qué armar un collage.
 *
 * Con 3 imágenes, la primera ocupa las dos filas de su columna (`row-span-2`) y las
 * otras dos se apilan al lado -- el resto del posicionamiento queda librado al
 * auto-flow de CSS grid, sin coordenadas explícitas por celda.
 */
export function LotesCollagePlaceholder({ images = [], className }: LotesCollagePlaceholderProps) {
  if (images.length === 0) return <CoverPlaceholder className={className} />;

  return (
    <div className={clsx('grid gap-0.5 bg-line', gridClass(images.length), className)}>
      {images.map((url, index) => (
        <img
          key={url + index}
          src={url}
          alt=""
          className={clsx('h-full w-full object-cover', images.length === 3 && index === 0 && 'row-span-2')}
        />
      ))}
    </div>
  );
}
