import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { CoverPlaceholder } from '../../remates/components/CoverPlaceholder';
import { BoxIcon } from '../../remates/components/icons';
import type { LoteImage } from '../../remates/types';

export interface ImageGalleryProps {
  images: LoteImage[];
  alt: string;
}

/**
 * Imagen principal + tira de miniaturas clickeables. El estado de "cuál imagen está
 * seleccionada" vive ACÁ, no en `SalaPage` ni en `ActiveLotePanel` -- cambiar de imagen
 * solo vuelve a renderizar este componente, nunca la cabecera ni el panel lateral de
 * ofertas (optimización de renderizado por colocación de estado, ver
 * docs/27-sala-del-remate.md, "Optimización del renderizado").
 */
export function ImageGallery({ images, alt }: ImageGalleryProps) {
  const sorted = useMemo(() => [...images].sort((a, b) => a.order - b.order), [images]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const selected = sorted[selectedIndex] ?? sorted[0];

  if (!selected) {
    return (
      <CoverPlaceholder
        className="aspect-video w-full rounded-xl"
        icon={<BoxIcon className="h-12 w-12 text-brand-300" />}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="aspect-video w-full overflow-hidden rounded-xl bg-slate-100">
        <img src={selected.url} alt={selected.caption ?? alt} className="h-full w-full object-cover" />
      </div>
      {sorted.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {sorted.map((image, index) => (
            <button
              key={`${image.url}-${index}`}
              type="button"
              onClick={() => setSelectedIndex(index)}
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
