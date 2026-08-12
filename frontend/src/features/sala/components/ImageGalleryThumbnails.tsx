import clsx from 'clsx';
import type { LoteImage } from '../../remates/types';

export interface ImageGalleryThumbnailsProps {
  sorted: LoteImage[];
  selectedIndex: number;
  hasMultiple: boolean;
  goTo: (index: number) => void;
  className?: string;
}

/**
 * Solo la tira de miniaturas clickeables (sin la imagen principal) -- extraída de
 * `ImageGallery` junto con `ImageGalleryMain`, ver el comentario de ese componente.
 * Controlado por props (mismo índice/`goTo` que la imagen principal, sea cual sea su
 * posición en el DOM) en vez de manejar su propio estado.
 */
export function ImageGalleryThumbnails({ sorted, selectedIndex, hasMultiple, goTo, className }: ImageGalleryThumbnailsProps) {
  if (!hasMultiple) return null;

  return (
    <div className={clsx('flex gap-2 overflow-x-auto pb-1', className)}>
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
  );
}
