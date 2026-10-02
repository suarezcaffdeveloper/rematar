import { useRef, useState } from 'react';
import { AnimatePresence, motion, useAnimationFrame, useMotionValue, useReducedMotion } from 'framer-motion';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { SYSTEM_SCREENS } from '../../features/landing/data';
import { EASE_OUT, Reveal, Shell, SplitHeading } from '../lib';

const AUTOPLAY_MS = 6500;
const COUNT = SYSTEM_SCREENS.length;

/** Distancia circular más corta entre el slide `index` y el activo (negativa = a la izquierda). */
function offsetOf(index: number, active: number): number {
  let offset = (((index - active) % COUNT) + COUNT) % COUNT;
  if (offset > COUNT / 2) offset -= COUNT;
  return offset;
}

/**
 * Capturas reales de la app en un carrusel de perspectiva: la pantalla activa al centro y las
 * vecinas giradas y más tenues a los costados. Se navega con clic, flechas, swipe o solo (con
 * barra de progreso); se pausa al apoyar el cursor y no corre fuera de pantalla.
 */
export function Showcase() {
  const reduce = useReducedMotion();
  const sectionRef = useRef<HTMLElement>(null);
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const progress = useMotionValue(0);
  const screen = SYSTEM_SCREENS[active];

  useAnimationFrame((_, delta) => {
    const el = sectionRef.current;
    if (!el || paused || reduce) return;
    const rect = el.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > window.innerHeight) return;
    const next = progress.get() + delta / AUTOPLAY_MS;
    if (next >= 1) {
      progress.set(0);
      setActive((current) => (current + 1) % COUNT);
    } else {
      progress.set(next);
    }
  });

  const go = (index: number) => {
    progress.set(0);
    setActive(((index % COUNT) + COUNT) % COUNT);
  };

  const arrow =
    'lv4-btn grid h-12 w-12 place-items-center rounded-[2px] border border-[var(--lv4-ink)]/25 [--lv4-fill:var(--lv4-ink)] hover:text-white';

  return (
    <section
      id="pantallas"
      ref={sectionRef}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      className="lv4-paper overflow-hidden py-24 sm:py-32 lg:py-44"
    >
      <Shell>
        <div className="flex flex-col justify-between gap-8 lg:flex-row lg:items-end">
          <SplitHeading
            lines={['La plataforma,', 'por dentro.']}
            className="lv4-serif text-[clamp(2.8rem,6.4vw,6.2rem)] leading-[0.95]"
          />
          <Reveal delay={0.15}>
            <p className="max-w-sm text-[17px] leading-relaxed text-[var(--lv4-ink)]/65">
              Capturas reales de la app, no maquetas. Así se ve cada pantalla cuando el remate está en marcha.
            </p>
          </Reveal>
        </div>
      </Shell>

      <Reveal delay={0.1} className="mt-14 sm:mt-20" y={40}>
        <motion.div
          className="relative mx-auto h-[14rem] w-full max-w-[96rem] touch-pan-y sm:h-[25rem] lg:h-[34rem]"
          style={{ perspective: 2000 }}
          onPanEnd={(_, info) => {
            if (Math.abs(info.offset.x) < 50) return;
            go(active + (info.offset.x < 0 ? 1 : -1));
          }}
        >
          {SYSTEM_SCREENS.map((item, index) => {
            const offset = offsetOf(index, active);
            const abs = Math.abs(offset);
            const isActive = offset === 0;
            return (
              <div
                key={item.key}
                aria-hidden={!isActive}
                onClick={() => !isActive && go(index)}
                onKeyDown={(event) => {
                  if (!isActive && (event.key === 'Enter' || event.key === ' ')) {
                    event.preventDefault();
                    go(index);
                  }
                }}
                role={isActive ? undefined : 'button'}
                tabIndex={isActive || abs > 1 ? -1 : 0}
                aria-label={isActive ? undefined : `Ver: ${item.title}`}
                className={`absolute left-1/2 top-0 w-[84%] transition-[transform,opacity] duration-[1000ms] [transition-timing-function:var(--lv4-ease)] sm:w-[64%] lg:w-[56%] ${
                  isActive ? '' : 'cursor-pointer'
                }`}
                style={{
                  transform: `translateX(calc(-50% + ${offset * 60}%)) translateZ(${-abs * 160}px) rotateY(${-offset * 14}deg) scale(${1 - abs * 0.05})`,
                  opacity: abs > 2 ? 0 : 1 - abs * 0.4,
                  zIndex: 10 - abs,
                  pointerEvents: abs > 2 ? 'none' : 'auto',
                }}
              >
                <div className="overflow-hidden rounded-[4px] border border-[var(--lv4-ink)]/15 bg-[var(--lv4-ink)] shadow-[0_60px_90px_-50px_rgba(6,8,15,0.6)]">
                  <div className="flex items-center gap-1.5 border-b border-white/10 px-3.5 py-2.5">
                    <span className="h-2 w-2 rounded-full bg-white/25" />
                    <span className="h-2 w-2 rounded-full bg-white/25" />
                    <span className="h-2 w-2 rounded-full bg-white/25" />
                    <span className="ml-3 truncate text-[11px] text-white/45">app.rematar.com/{item.key}</span>
                  </div>
                  <img
                    src={item.image}
                    alt={isActive ? `Captura: ${item.title}` : ''}
                    loading="lazy"
                    draggable={false}
                    className="block aspect-[1900/915] w-full object-cover object-top"
                  />
                </div>
              </div>
            );
          })}
        </motion.div>
      </Reveal>

      <Shell className="mt-8 sm:mt-12">
        <div className="mx-auto grid max-w-4xl items-end gap-6 sm:grid-cols-[1fr_auto]">
          <div className="min-h-[6rem]" aria-live="polite">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={screen.key}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.4, ease: EASE_OUT }}
              >
                <h3 className="lv4-serif text-[2.2rem] leading-none">{screen.title}</h3>
                <p className="mt-3 max-w-lg text-[16px] leading-relaxed text-[var(--lv4-ink)]/65">{screen.description}</p>
              </motion.div>
            </AnimatePresence>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => go(active - 1)} aria-label="Pantalla anterior" className={arrow}>
              <ArrowLeft className="h-5 w-5" strokeWidth={1.25} aria-hidden="true" />
            </button>
            <button type="button" onClick={() => go(active + 1)} aria-label="Pantalla siguiente" className={arrow}>
              <ArrowRight className="h-5 w-5" strokeWidth={1.25} aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="mx-auto mt-8 flex max-w-4xl gap-1.5" role="tablist" aria-label="Pantallas">
          {SYSTEM_SCREENS.map((item, index) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={index === active}
              aria-label={item.title}
              onClick={() => go(index)}
              className="group h-6 flex-1 py-2.5"
            >
              <span className="relative block h-px bg-[var(--lv4-ink)]/20 transition-colors duration-300 group-hover:bg-[var(--lv4-ink)]/45">
                {index < active && <span className="absolute inset-x-0 -top-px h-[3px] bg-[var(--lv4-ink)]" />}
                {index === active && (
                  <motion.span style={{ scaleX: progress }} className="absolute inset-x-0 -top-px h-[3px] origin-left bg-[var(--lv4-ink)]" />
                )}
              </span>
            </button>
          ))}
        </div>
      </Shell>
    </section>
  );
}
