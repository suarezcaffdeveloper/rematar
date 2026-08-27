import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Reveal } from '../../../shared/components/Reveal';
import { MockupWindow } from './MockupWindow';
import { SYSTEM_SCREENS } from '../data';

const IMG_H = 340;
const BAR_H = 38;
const CAP_H = 128;
const CARD_H = BAR_H + IMG_H + CAP_H; // 506 px

// Active card: 62 % of viewport. Adjacent cards show ~30 % of their width on each side.
const CARD_W_PCT = 62;
const PEEK_W_PCT = (100 - CARD_W_PCT) / 2; // 19

const DRAG_THRESHOLD = 52;

/** Shortest signed offset of item i from activeIndex in a circular ring of `total`. */
function circularOffset(i: number, active: number, total: number): number {
  const raw = ((i - active) % total + total) % total;
  return raw > total / 2 ? raw - total : raw;
}

export function ScreenshotsSection() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartX = useRef<number | null>(null);

  const total = SYSTEM_SCREENS.length;

  // Wraps around: goTo(-1) → last slide, goTo(total) → first slide.
  const goTo = useCallback(
    (index: number) => {
      setActiveIndex(((index % total) + total) % total);
      setDragOffset(0);
    },
    [total],
  );

  const onPointerDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragStartX.current = e.clientX;
    setIsDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (dragStartX.current === null) return;
    // No edge resistance — circular carousel has no edges.
    setDragOffset(e.clientX - dragStartX.current);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (dragStartX.current === null) return;
    const delta = e.clientX - dragStartX.current;
    dragStartX.current = null;
    setIsDragging(false);
    if (delta < -DRAG_THRESHOLD) goTo(activeIndex + 1);
    else if (delta > DRAG_THRESHOLD) goTo(activeIndex - 1);
    else setDragOffset(0);
  };

  const onPointerCancel = () => {
    dragStartX.current = null;
    setIsDragging(false);
    setDragOffset(0);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') goTo(activeIndex - 1);
      if (e.key === 'ArrowRight') goTo(activeIndex + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeIndex, goTo]);

  return (
    <section id="plataforma" className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
      <Reveal className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          Así se ve por dentro
        </h2>
        <p className="mt-4 text-lg text-slate-600">
          Un vistazo real a las pantallas que ven compradores y martilleros.
        </p>
      </Reveal>

      <div className="mt-14">
        {/*
         * Outer wrapper: NOT overflow-hidden, so arrows can safely sit outside
         * the clipping viewport. max-w caps the total width; arrows use
         * negative offsets on lg+ where the section has enough side padding.
         */}
        <div className="relative mx-auto" style={{ maxWidth: 920 }}>

          {/* ── Arrow left ─────────────────────────────────────────────── */}
          <button
            type="button"
            onClick={() => goTo(activeIndex - 1)}
            aria-label="Pantalla anterior"
            className="absolute left-1 z-20 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-md transition-all hover:border-brand-300 hover:bg-brand-50 hover:text-brand-600 hover:shadow-lg lg:-left-8"
            style={{ top: CARD_H / 2 }}
          >
            <ChevronLeft className="h-5 w-5" />
          </button>

          {/* ── Clipping viewport ──────────────────────────────────────── */}
          <div
            className="relative overflow-hidden rounded-2xl cursor-grab active:cursor-grabbing"
            style={{ height: CARD_H }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
          >
            {SYSTEM_SCREENS.map((screen, i) => {
              const offset = circularOffset(i, activeIndex, total);
              const isActive = offset === 0;
              const dist = Math.abs(offset);
              return (
                <div
                  key={screen.key}
                  aria-hidden={!isActive}
                  className="absolute top-0 select-none"
                  style={{
                    // Each card is CARD_W_PCT wide, centred horizontally via PEEK_W_PCT left offset
                    left: `${PEEK_W_PCT}%`,
                    width: `${CARD_W_PCT}%`,
                    height: CARD_H,
                    /*
                     * translateX 100% = element's own width = CARD_W_PCT% of viewport.
                     * So offset ±1 places the card exactly one card-width to the left/right,
                     * leaving PEEK_W_PCT% visible on each side.
                     */
                    transform: `translateX(calc(${offset * 100}% + ${dragOffset}px)) scale(${isActive ? 1 : 0.93})`,
                    transformOrigin: 'center center',
                    transition: isDragging
                      ? 'none'
                      : 'transform 0.52s cubic-bezier(0.4,0,0.2,1), opacity 0.52s ease, filter 0.52s ease',
                    opacity: dist > 1 ? 0 : isActive ? 1 : 0.48,
                    filter: isActive ? 'none' : 'blur(3px)',
                    pointerEvents: isActive ? 'auto' : 'none',
                  }}
                >
                  <MockupWindow urlLabel={`app.rematar.com/${screen.key}`} noPadding>
                    <div className="flex items-center justify-center bg-slate-50" style={{ height: IMG_H }}>
                      <img
                        src={screen.image}
                        alt={screen.title}
                        draggable={false}
                        loading="lazy"
                        style={{
                          display: 'block',
                          width: '100%',
                          height: '100%',
                          objectFit: 'contain',
                          objectPosition: 'center',
                        }}
                      />
                    </div>
                  </MockupWindow>
                  <div className="mt-4 px-2 text-center">
                    <p className="text-sm font-semibold text-slate-900">{screen.title}</p>
                    <p className="mt-1 text-sm text-slate-500">{screen.description}</p>
                  </div>
                </div>
              );
            })}

            {/* Side gradient masks – only a thin edge fade so adjacent cards stay visible */}
            <div
              className="pointer-events-none absolute inset-y-0 left-0 z-10"
              style={{
                width: '9%',
                background: 'linear-gradient(to right, #ffffff, transparent)',
              }}
            />
            <div
              className="pointer-events-none absolute inset-y-0 right-0 z-10"
              style={{
                width: '9%',
                background: 'linear-gradient(to left, #ffffff, transparent)',
              }}
            />
          </div>

          {/* ── Arrow right ────────────────────────────────────────────── */}
          <button
            type="button"
            onClick={() => goTo(activeIndex + 1)}
            aria-label="Pantalla siguiente"
            className="absolute right-1 z-20 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-md transition-all hover:border-brand-300 hover:bg-brand-50 hover:text-brand-600 hover:shadow-lg lg:-right-8"
            style={{ top: CARD_H / 2 }}
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        {/* Dot indicators */}
        <div className="mt-8 flex justify-center gap-2">
          {SYSTEM_SCREENS.map((screen, i) => (
            <button
              key={screen.key}
              type="button"
              aria-label={`Ir a ${screen.title}`}
              onClick={() => goTo(i)}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === activeIndex ? 'w-6 bg-brand-600' : 'w-1.5 bg-slate-300 hover:bg-slate-400'
              }`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

