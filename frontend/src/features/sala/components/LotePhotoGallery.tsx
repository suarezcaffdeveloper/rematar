import { ChevronLeft, ChevronRight } from 'lucide-react';
import { CoverPlaceholder } from '../../remates/components/CoverPlaceholder';
import { BoxIcon } from '../../remates/components/icons';
import type { Lote } from '../../remates/types';
import { useImageGallery } from './useImageGallery';
import { optimizedImage } from '../../../shared/lib/image';

/**
 * Galería de fotos de un lote: foto completa sobre un fondo desenfocado (las fotos que
 * suben las empresas no vienen todas en la misma proporción, y así ninguna se recorta),
 * flechas, contador y tira de miniaturas. Sin fotos, el respaldo de marca. La comparten la
 * Sala en vivo y la Sala Timed.
 */
export function LotePhotoGallery({ lote }: { lote: Lote }) {
  const gallery = useImageGallery(lote.images);
  const { sorted, selected, selectedIndex, hasMultiple, goTo } = gallery;

  return (
    <div className="flex flex-col gap-2.5">
      <div className="relative aspect-video overflow-hidden rounded-2xl bg-ink">
        {selected ? (
          <>
            {/* Fondo desenfocado + foto completa: las fotos que suben las empresas no
             * vienen todas en la misma proporción, y así ninguna se recorta. */}
            <img
              src={optimizedImage(selected.url, 1200)}
              decoding="async"
              alt=""
              aria-hidden="true"
              className="absolute inset-0 h-full w-full scale-110 object-cover opacity-50 blur-2xl"
            />
            <img
              key={selected.url}
              src={selected.url}
              alt={selected.caption ?? `${lote.title}, foto ${selectedIndex + 1} de ${sorted.length}`}
              className="absolute inset-0 h-full w-full object-contain"
            />
          </>
        ) : (
          <CoverPlaceholder
            className="absolute inset-0 h-full w-full"
            icon={<BoxIcon className="h-10 w-10 text-brand-300" />}
          />
        )}

        {hasMultiple && (
          <>
            <button
              type="button"
              aria-label="Foto anterior"
              onClick={() => goTo(selectedIndex - 1)}
              className="absolute left-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-ink shadow transition-colors hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <ChevronLeft aria-hidden="true" className="h-5 w-5" />
            </button>
            <button
              type="button"
              aria-label="Foto siguiente"
              onClick={() => goTo(selectedIndex + 1)}
              className="absolute right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-ink shadow transition-colors hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <ChevronRight aria-hidden="true" className="h-5 w-5" />
            </button>
            <p className="absolute bottom-3 right-3 rounded-full bg-ink/70 px-2.5 py-1 text-xs tabular-nums text-white backdrop-blur">
              {selectedIndex + 1} de {sorted.length}
            </p>
          </>
        )}
      </div>

      {hasMultiple && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Fotos del lote">
          {sorted.map((image, i) => (
            <button
              key={`${image.url}-${i}`}
              type="button"
              onClick={() => goTo(i)}
              aria-label={`Ver foto ${i + 1}`}
              aria-pressed={selectedIndex === i}
              className={`h-14 w-[5.5rem] overflow-hidden rounded-lg ring-offset-2 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                selectedIndex === i ? 'ring-2 ring-ink' : 'opacity-60 hover:opacity-100'
              }`}
            >
              <img src={optimizedImage(image.url, 1200)} decoding="async" alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
