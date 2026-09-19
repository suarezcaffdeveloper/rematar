import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import clsx from 'clsx';

export interface LoteBoardCarouselProps {
  /** Una entrada por lote -- cada una ya viene con su `key`. */
  children: ReactNode[];
  /** Cambia cuando el orden de los lotes cambia -- el riel vuelve al inicio. */
  resetKey?: string;
  label: string;
}

/** Ancho de cada slot: 1 visible en mobile, 2 en `sm`, 3 en `lg`, 4 en `xl`. El `gap-4`
 * (1rem) se descuenta del ancho para que la última columna visible nunca quede cortada. */
const SLOT_WIDTH_CLASSES =
  'w-full sm:w-[calc((100%-1rem)/2)] lg:w-[calc((100%-2rem)/3)] xl:w-[calc((100%-3rem)/4)]';

const EDGE_TOLERANCE_PX = 4;

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
      aria-label={direction === 'prev' ? 'Lotes anteriores' : 'Lotes siguientes'}
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        'flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line bg-white text-ink-muted',
        'transition-colors hover:bg-surface-subtle hover:text-ink',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
        'disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white',
      )}
    >
      <Icon aria-hidden="true" className="h-4 w-4" />
    </button>
  );
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

/**
 * Riel horizontal del tablero de lotes: scroll nativo con `scroll-snap` (swipe y arrastre
 * gratis) y flechas que avanzan una "página" completa -- tantos lotes como se ven a la
 * vez --, con desplazamiento suave. Mismo enfoque que `LoteResultCarousel` del historial,
 * sin librerías nuevas. Cuando todos los lotes entran en pantalla no muestra controles.
 */
export function LoteBoardCarousel({ children, resetKey, label }: LoteBoardCarouselProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(false);
  const [range, setRange] = useState({ first: 1, last: 1 });
  const total = children.length;

  const updateScrollState = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    setCanScrollPrev(el.scrollLeft > EDGE_TOLERANCE_PX);
    setCanScrollNext(el.scrollLeft < el.scrollWidth - el.clientWidth - EDGE_TOLERANCE_PX);

    const slot = el.firstElementChild as HTMLElement | null;
    const slotWidth = slot ? slot.getBoundingClientRect().width + 16 : 0;
    if (slotWidth > 0) {
      const first = Math.round(el.scrollLeft / slotWidth) + 1;
      const visible = Math.max(1, Math.round((el.clientWidth + 16) / slotWidth));
      setRange({ first, last: Math.min(total, first + visible - 1) });
    }
  }, [total]);

  useEffect(() => {
    updateScrollState();
    window.addEventListener('resize', updateScrollState);
    return () => window.removeEventListener('resize', updateScrollState);
  }, [updateScrollState]);

  useEffect(() => {
    scrollerRef.current?.scrollTo?.({ left: 0, behavior: 'auto' });
    updateScrollState();
  }, [resetKey, updateScrollState]);

  function scrollByPage(direction: 1 | -1) {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({
      left: direction * el.clientWidth,
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    });
  }

  const hasOverflow = canScrollPrev || canScrollNext;

  return (
    <div className="flex flex-col gap-3" role="region" aria-roledescription="carrusel" aria-label={label}>
      {hasOverflow && (
        <div className="flex items-center justify-end gap-3">
          <span className="text-xs tabular-nums text-ink-faint" aria-live="polite">
            {range.first}–{range.last} de {total}
          </span>
          <div className="flex gap-2">
            <ArrowButton direction="prev" onClick={() => scrollByPage(-1)} disabled={!canScrollPrev} />
            <ArrowButton direction="next" onClick={() => scrollByPage(1)} disabled={!canScrollNext} />
          </div>
        </div>
      )}

      <div
        ref={scrollerRef}
        onScroll={updateScrollState}
        className="flex snap-x snap-mandatory items-stretch gap-4 overflow-x-auto scroll-smooth overscroll-x-contain pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {children.map((child, index) => (
          <div key={index} className={clsx('shrink-0 snap-start', SLOT_WIDTH_CLASSES)}>
            {child}
          </div>
        ))}
      </div>
    </div>
  );
}
