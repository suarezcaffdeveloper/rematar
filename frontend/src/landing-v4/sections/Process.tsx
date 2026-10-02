import { useRef, useState } from 'react';
import { AnimatePresence, motion, useMotionValueEvent, useReducedMotion, useScroll, useSpring } from 'framer-motion';
import { TIMELINE_STEPS } from '../../features/landing/data';
import { STEP_OWNERS, STEP_PHOTOS, type StepOwner } from '../data';
import { EASE, EASE_OUT, Shell, SplitHeading } from '../lib';

const OWNER_DOT: Record<StepOwner, string> = {
  Empresa: 'bg-[var(--lv4-cobalt-soft)]',
  Martillero: 'bg-[var(--lv4-brass)]',
  Comprador: 'bg-white',
  Sistema: 'bg-white/35',
};

/**
 * Los 7 pasos de un remate como secuencia real, sobre fondo de cine. En escritorio la imagen y el
 * numeral quedan fijos y cambian con el scroll (cada paso tiene su propia fotografía); la línea
 * de progreso se llena a medida que se avanza. Cada paso indica quién lo protagoniza.
 */
export function Process() {
  const reduce = useReducedMotion();
  const listRef = useRef<HTMLOListElement>(null);
  const [active, setActive] = useState(0);
  const { scrollYProgress } = useScroll({ target: listRef, offset: ['start 0.55', 'end 0.55'] });
  const line = useSpring(scrollYProgress, { stiffness: 140, damping: 26, mass: 0.4 });

  useMotionValueEvent(scrollYProgress, 'change', (value) => {
    setActive(Math.min(TIMELINE_STEPS.length - 1, Math.max(0, Math.floor(value * TIMELINE_STEPS.length))));
  });

  const step = TIMELINE_STEPS[active];
  const photo = STEP_PHOTOS[active];

  return (
    <section id="como-funciona" className="lv4-dark relative isolate overflow-hidden py-24 sm:py-32 lg:py-44">
      {/* Fotografía del paso activo, a pantalla completa y muy oscurecida. */}
      <div aria-hidden="true" className="absolute inset-0 -z-10">
        <AnimatePresence initial={false}>
          <motion.img
            key={photo.url}
            src={photo.url}
            alt=""
            loading="lazy"
            initial={{ opacity: 0, scale: 1.12 }}
            animate={{ opacity: 0.4, scale: 1.02 }}
            exit={{ opacity: 0 }}
            transition={{ opacity: { duration: 1.3, ease: EASE }, scale: { duration: 14, ease: 'linear' } }}
            className="absolute inset-0 h-full w-full object-cover"
          />
        </AnimatePresence>
        <div className="absolute inset-0 bg-[var(--lv4-ink)]/70" />
        <div className="absolute inset-0 bg-gradient-to-b from-[var(--lv4-ink)] via-transparent to-[var(--lv4-ink)]" />
        <div className="lv4-vignette absolute inset-0" />
      </div>

      <Shell>
        <SplitHeading
          lines={['De crear el remate', 'a entregar el lote.']}
          className="lv4-serif text-[clamp(2.8rem,6.4vw,6.2rem)] leading-[0.95]"
        />

        <div className="mt-16 grid gap-10 lg:mt-24 lg:grid-cols-[0.8fr_1.2fr] lg:gap-24">
          <div className="hidden lg:block">
            <div className="sticky top-32">
              <div className="flex h-[13rem] items-end overflow-hidden">
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.span
                    key={step.number}
                    initial={{ y: reduce ? 0 : '100%', opacity: reduce ? 0 : 1 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: reduce ? 0 : '-100%', opacity: reduce ? 0 : 1 }}
                    transition={{ duration: 0.8, ease: EASE }}
                    className="lv4-serif lv4-num block text-[13rem] leading-[0.82]"
                  >
                    {step.number}
                  </motion.span>
                </AnimatePresence>
                <span className="lv4-serif mb-4 ml-4 text-4xl italic text-white/40">de {TIMELINE_STEPS.length}</span>
              </div>
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={step.number}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.35, ease: EASE_OUT }}
                  className="mt-8 border-t border-white/20 pt-6"
                >
                  <p className="lv4-serif text-3xl leading-tight">{step.title}</p>
                  <p className="mt-3 flex items-center gap-2.5 text-[14px] text-white/65">
                    <span className={`block h-1.5 w-1.5 rounded-full ${OWNER_DOT[STEP_OWNERS[active]]}`} />
                    {STEP_OWNERS[active]}
                  </p>
                </motion.div>
              </AnimatePresence>
            </div>
          </div>

          <div className="relative">
            <div aria-hidden="true" className="absolute bottom-3 left-0 top-3 w-px bg-white/15">
              <motion.div style={{ scaleY: line }} className="h-full origin-top bg-white" />
            </div>
            <ol ref={listRef}>
              {TIMELINE_STEPS.map((item, index) => {
                const isActive = index === active;
                const owner = STEP_OWNERS[index];
                return (
                  <li
                    key={item.number}
                    className={`relative border-b border-white/12 py-9 pl-8 transition-opacity duration-700 [transition-timing-function:var(--lv4-ease)] first:pt-3 sm:pl-12 sm:py-12 ${
                      isActive ? 'opacity-100' : 'opacity-35'
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`absolute -left-[3px] top-12 block h-[7px] w-[7px] rounded-full transition-all duration-700 [transition-timing-function:var(--lv4-ease)] first:top-5 ${
                        index <= active ? 'scale-100 bg-white' : 'scale-75 bg-white/30'
                      } ${isActive ? 'shadow-[0_0_0_6px_rgba(255,255,255,0.12)]' : ''}`}
                    />
                    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
                      <span className="lv4-serif lv4-num text-3xl italic text-white/50 lg:hidden">{item.number}</span>
                      <h3 className="lv4-serif text-[clamp(1.8rem,3vw,2.6rem)] leading-[1.05]">{item.title}</h3>
                    </div>
                    <p className="mt-3 max-w-[30rem] text-[16px] leading-relaxed text-white/65">{item.description}</p>
                    <p className="mt-4 flex items-center gap-2.5 text-[13px] text-white/55">
                      <span className={`block h-1.5 w-1.5 rounded-full ${OWNER_DOT[owner]}`} />
                      {owner}
                    </p>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      </Shell>
    </section>
  );
}
