import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import clsx from 'clsx';
import type { PostAuctionCase } from '../../postauction/types';
import type { Lote } from '../../remates/types';
import type { LoteHistoryDetail } from '../types';
import { LoteResultCard } from './LoteResultCard';

export interface LoteResultCarouselProps {
  lotes: Lote[];
  currency: string;
  offerResults: Map<string, LoteHistoryDetail | null | undefined>;
  casesByLoteId: Map<string, PostAuctionCase>;
}

/** Ancho de cada card -- 1 visible en mobile, 2 en tablet, 3 en desktop (mismos
 * breakpoints `sm`/`lg` que usaba la grilla anterior), calculado para que el `gap-4`
 * (1rem) entre cards nunca se coma espacio de la última columna visible. */
const CARD_WIDTH_CLASSES = 'w-full sm:w-[calc((100%-1rem)/2)] lg:w-[calc((100%-2rem)/3)]';

function ArrowButton({
  direction,
  onClick,
  disabled,
}: {
  direction: 'prev' | 'next';
  onClick: () => void;
  disabled: boolean;
}) {
  const Icon = direction === 'prev' ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      aria-label={direction === 'prev' ? 'Lote anterior' : 'Lote siguiente'}
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        'flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line bg-white text-ink-muted shadow-sm',
        'transition-colors hover:bg-surface-subtle hover:text-ink',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
        'disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white',
      )}
    >
      <Icon aria-hidden="true" className="h-4 w-4" />
    </button>
  );
}

/**
 * Carrusel de "Resultado de cada lote" en el informe ejecutivo del historial -- pedido
 * explícito: en vez de una grilla que crece verticalmente con todos los lotes, mostrar
 * como máximo 3 a la vez (2 en tablet, 1 en mobile) con flechas para desplazarse de a
 * una card por click. Implementado sobre scroll horizontal nativo con `scroll-snap`
 * (`overflow-x-auto` + `snap-x snap-mandatory`) en vez de reimplementar el desplazamiento
 * a mano: las flechas solo llaman `scrollBy` con el ancho real de la primera card (medido
 * en el DOM, así funciona igual sea que haya 1, 2 o 3 visibles según el breakpoint), y el
 * usuario además puede arrastrar/hacer swipe directamente sobre el riel si su dispositivo
 * lo soporta -- gratis, sin código extra.
 */
export function LoteResultCarousel({ lotes, currency, offerResults, casesByLoteId }: LoteResultCarouselProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(false);

  function updateScrollState() {
    const el = scrollerRef.current;
    if (!el) return;
    setCanScrollPrev(el.scrollLeft > 4);
    setCanScrollNext(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
  }

  // Recalcula al montar y cada vez que cambia la cantidad de lotes (ej. filtros futuros)
  // -- `scrollWidth`/`clientWidth` no cambian solos, pero el contenido sí.
  useEffect(() => {
    updateScrollState();
  }, [lotes.length]);

  function scrollByOneCard(direction: 1 | -1) {
    const el = scrollerRef.current;
    if (!el) return;
    const firstCard = el.firstElementChild as HTMLElement | null;
    const gapPx = 16; // gap-4
    const step = firstCard ? firstCard.getBoundingClientRect().width + gapPx : el.clientWidth;
    el.scrollBy({ left: direction * step, behavior: 'smooth' });
  }

  if (lotes.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-ink">Resultado de cada lote</h2>
        {lotes.length > 1 && (
          <div className="flex gap-2">
            <ArrowButton direction="prev" onClick={() => scrollByOneCard(-1)} disabled={!canScrollPrev} />
            <ArrowButton direction="next" onClick={() => scrollByOneCard(1)} disabled={!canScrollNext} />
          </div>
        )}
      </div>

      <div
        ref={scrollerRef}
        onScroll={updateScrollState}
        className="flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {lotes.map((lote) => (
          <div key={lote.id} className={clsx('shrink-0 snap-start', CARD_WIDTH_CLASSES)}>
            <LoteResultCard
              lote={lote}
              currency={currency}
              offerDetail={offerResults.get(lote.id)}
              postAuctionCase={casesByLoteId.get(lote.id)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
