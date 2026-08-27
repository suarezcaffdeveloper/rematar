import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Reveal } from '../../../shared/components/Reveal';
import { PhotoFrame } from '../../../shared/components/PhotoFrame';
import { RUBROS } from '../data';

const DRAG_THRESHOLD = 40;

export function WhatIsSection() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(true);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [visibleCount, setVisibleCount] = useState(6);
  const dragStartX = useRef<number | null>(null);

  const total = RUBROS.length; // 9
  // Tripled list for seamless infinite loop
  const items = [...RUBROS, ...RUBROS, ...RUBROS];

  // Update visible card count based on window width
  useEffect(() => {
    const updateVisible = () => {
      if (window.innerWidth >= 1024) {
        setVisibleCount(6);
      } else if (window.innerWidth >= 640) {
        setVisibleCount(3);
      } else {
        setVisibleCount(2);
      }
    };
    updateVisible();
    window.addEventListener('resize', updateVisible);
    return () => window.removeEventListener('resize', updateVisible);
  }, []);

  const goTo = useCallback(
    (index: number) => {
      setIsTransitioning(true);
      setCurrentIndex(index);
      setDragOffset(0);
    },
    [],
  );

  const handleNext = useCallback(() => {
    goTo(currentIndex + 1);
  }, [currentIndex, goTo]);

  const handlePrev = useCallback(() => {
    goTo(currentIndex - 1);
  }, [currentIndex, goTo]);

  // Handle seamless infinite loop wrap
  const handleTransitionEnd = () => {
    if (currentIndex >= total) {
      setIsTransitioning(false);
      setCurrentIndex(currentIndex % total);
    } else if (currentIndex < 0) {
      setIsTransitioning(false);
      setCurrentIndex(((currentIndex % total) + total) % total);
    }
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragStartX.current = e.clientX;
    setIsDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (dragStartX.current === null) return;
    setDragOffset(e.clientX - dragStartX.current);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (dragStartX.current === null) return;
    const delta = e.clientX - dragStartX.current;
    dragStartX.current = null;
    setIsDragging(false);
    if (delta < -DRAG_THRESHOLD) handleNext();
    else if (delta > DRAG_THRESHOLD) handlePrev();
    else setDragOffset(0);
  };

  const onPointerCancel = () => {
    dragStartX.current = null;
    setIsDragging(false);
    setDragOffset(0);
  };

  // Normalized active index (0..total-1) for indicators
  const normalizedIndex = ((currentIndex % total) + total) % total;

  // Percentage width per item: 100 / visibleCount
  const itemWidthPct = 100 / visibleCount;
  // Offset in percentage: total items before us is (total + currentIndex)
  const baseOffsetPct = (total + currentIndex) * itemWidthPct;

  return (
    <section id="nosotros" className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
      <Reveal className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          ¿Qué es RematAR?
        </h2>
        <p className="mt-5 text-lg leading-relaxed text-slate-600">
          RematAR es una plataforma para realizar remates online completos, con
          interacción en tiempo real entre compradores y martilleros. Desde la
          creación del evento hasta la adjudicación del último lote, todo sucede en
          vivo, en un mismo lugar.
        </p>
      </Reveal>

      {/* ── Carousel Wrapper ────────────────────────────────────────── */}
      <div className="relative mt-16">
        {/* Left Arrow Button */}
        <button
          type="button"
          onClick={handlePrev}
          aria-label="Categoría anterior"
          className="absolute -left-3 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-md transition-all hover:border-brand-300 hover:bg-brand-50 hover:text-brand-600 hover:shadow-lg sm:-left-5 sm:h-11 sm:w-11"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>

        {/* Viewport */}
        <div
          className="overflow-hidden rounded-2xl cursor-grab active:cursor-grabbing px-1 py-2"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
        >
          <div
            className="flex"
            onTransitionEnd={handleTransitionEnd}
            style={{
              transform: `translateX(calc(-${baseOffsetPct}% + ${dragOffset}px))`,
              transition: isDragging || !isTransitioning ? 'none' : 'transform 0.45s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          >
            {items.map((rubro, index) => (
              <div
                key={`${rubro.label}-${index}`}
                className="shrink-0 px-2 select-none"
                style={{ width: `${itemWidthPct}%` }}
              >
                <PhotoFrame
                  photo={rubro.photo}
                  rounded="rounded-2xl"
                  className="aspect-[3/4] transition-transform duration-300 hover:-translate-y-1 shadow-sm hover:shadow-md"
                  label={rubro.label}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Right Arrow Button */}
        <button
          type="button"
          onClick={handleNext}
          aria-label="Categoría siguiente"
          className="absolute -right-3 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-md transition-all hover:border-brand-300 hover:bg-brand-50 hover:text-brand-600 hover:shadow-lg sm:-right-5 sm:h-11 sm:w-11"
        >
          <ChevronRight className="h-5 w-5" />
        </button>

        {/* Dot Indicators */}
        <div className="mt-8 flex justify-center gap-1.5 sm:gap-2">
          {RUBROS.map((rubro, i) => (
            <button
              key={rubro.label}
              type="button"
              aria-label={`Ir a categoría ${rubro.label}`}
              onClick={() => goTo(i)}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === normalizedIndex ? 'w-6 bg-brand-600' : 'w-1.5 bg-slate-300 hover:bg-slate-400'
              }`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
