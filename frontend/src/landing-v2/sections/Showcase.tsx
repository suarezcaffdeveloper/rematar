import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useMotionValue, useReducedMotion, useSpring, useTransform } from 'framer-motion';
import { SYSTEM_SCREENS } from '../../features/landing/data';
import { EASE } from '../lib';

const AUTOPLAY_MS = 6000;

/**
 * Visor de las capturas reales de la app. Se mueve solo (con barra de progreso por pantalla),
 * se frena al pasar el mouse y el marco se inclina siguiendo el cursor. Con
 * `prefers-reduced-motion` no avanza solo ni se inclina.
 */
export function Showcase() {
  const reduceMotion = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const frameRef = useRef<HTMLDivElement>(null);
  const screen = SYSTEM_SCREENS[index];

  useEffect(() => {
    if (paused || reduceMotion) return;
    const id = window.setTimeout(() => setIndex((current) => (current + 1) % SYSTEM_SCREENS.length), AUTOPLAY_MS);
    return () => window.clearTimeout(id);
  }, [index, paused, reduceMotion]);

  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const rotateY = useSpring(useTransform(px, [-0.5, 0.5], [-5, 5]), { stiffness: 120, damping: 18 });
  const rotateX = useSpring(useTransform(py, [-0.5, 0.5], [4, -4]), { stiffness: 120, damping: 18 });

  return (
    <section id="sistema" className="lv2-paper relative overflow-hidden px-5 py-28 sm:px-8 sm:py-36 lg:px-12">
      <div className="mx-auto max-w-[96rem]">
        <h2 className="lv2-serif max-w-4xl text-[clamp(2.4rem,5.6vw,5.6rem)] font-light leading-[1] tracking-[-0.02em] text-ink">
          El sistema, por dentro.
        </h2>
        <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-ink-muted">
          Capturas reales de la aplicación funcionando, no recreaciones.
        </p>

        <div
          className="mt-14 grid gap-10 lg:grid-cols-[19rem_1fr] lg:gap-14"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          <ol className="order-2 space-y-1 lg:order-1" aria-label="Pantallas del sistema">
            {SYSTEM_SCREENS.map((item, i) => {
              const active = i === index;
              return (
                <li key={item.key}>
                  <button
                    type="button"
                    onClick={() => setIndex(i)}
                    aria-current={active}
                    className="group relative block w-full py-3 pl-5 text-left"
                  >
                    <span className="absolute inset-y-2 left-0 w-[2px] overflow-hidden rounded-full bg-line-strong">
                      {active && (
                        <span
                          key={`${index}-${paused}`}
                          className="absolute inset-0 origin-top bg-ink"
                          style={{
                            animation: reduceMotion || paused ? undefined : `lv2-progress ${AUTOPLAY_MS}ms linear forwards`,
                            transform: reduceMotion || paused ? 'scaleY(1)' : undefined,
                          }}
                        />
                      )}
                    </span>
                    <span
                      className={`block text-[15px] font-semibold transition-colors ${
                        active ? 'text-ink' : 'text-ink-faint group-hover:text-ink-muted'
                      }`}
                    >
                      {item.title}
                    </span>
                    <AnimatePresence initial={false}>
                      {active && (
                        <motion.span
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.4, ease: EASE }}
                          className="block overflow-hidden text-[14px] leading-relaxed text-ink-muted"
                        >
                          <span className="block pt-1.5">{item.description}</span>
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </button>
                </li>
              );
            })}
          </ol>

          <div className="order-1 lg:order-2" style={{ perspective: 1600 }}>
            <motion.div
              ref={frameRef}
              style={reduceMotion ? undefined : { rotateX, rotateY, transformStyle: 'preserve-3d' }}
              onMouseMove={(event) => {
                if (reduceMotion || !frameRef.current) return;
                const rect = frameRef.current.getBoundingClientRect();
                px.set((event.clientX - rect.left) / rect.width - 0.5);
                py.set((event.clientY - rect.top) / rect.height - 0.5);
              }}
              onMouseLeave={() => {
                px.set(0);
                py.set(0);
              }}
              className="overflow-hidden rounded-2xl bg-ink shadow-[0_50px_100px_-30px_rgba(16,17,20,0.55)] ring-1 ring-ink/10"
            >
              <div className="flex items-center gap-2 border-b border-white/10 bg-ink px-4 py-3">
                <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
                <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
                <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
                <span className="ml-3 truncate rounded-md bg-white/10 px-3 py-0.5 text-[11px] text-white/55">
                  app.rematar.com/{screen.key}
                </span>
              </div>
              <div className="relative aspect-[1900/910] bg-white">
                <AnimatePresence mode="sync" initial={false}>
                  <motion.img
                    key={screen.key}
                    src={screen.image}
                    alt={screen.title}
                    loading="lazy"
                    initial={{ opacity: 0, scale: 1.035 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.8, ease: EASE }}
                    className="absolute inset-0 h-full w-full object-cover object-top"
                  />
                </AnimatePresence>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}
