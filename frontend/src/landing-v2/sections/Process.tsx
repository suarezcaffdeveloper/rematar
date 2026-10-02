import { useRef } from 'react';
import { type MotionValue, motion, useScroll, useSpring, useTransform } from 'framer-motion';
import { TIMELINE_STEPS, type TimelineStep } from '../../features/landing/data';
import { STOCK_PHOTOS } from '../../shared/media/stockPhotos';

function Step({ step }: { step: TimelineStep }) {
  const ref = useRef<HTMLLIElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 82%', 'start 50%'] });
  const opacity = useTransform(scrollYProgress, [0, 1], [0.22, 1]);
  const x = useTransform(scrollYProgress, [0, 1], [24, 0]);
  const dot = useTransform(scrollYProgress, [0, 1], ['rgba(255,255,255,0.18)', 'rgb(110,139,247)']);

  return (
    <motion.li ref={ref} style={{ opacity, x }} className="relative grid grid-cols-[3.2rem_1fr] gap-5 py-9 sm:grid-cols-[5.5rem_1fr]">
      <motion.span
        aria-hidden="true"
        style={{ backgroundColor: dot }}
        className="absolute top-[2.85rem] hidden h-[9px] w-[9px] rounded-full lg:-left-[calc(2rem+4.5px)] lg:block"
      />
      <span className="lv2-serif text-5xl font-light tabular-nums leading-none text-white/40 sm:text-6xl">
        {String(step.number).padStart(2, '0')}
      </span>
      <div>
        <h3 className="text-xl font-semibold leading-snug sm:text-2xl">{step.title}</h3>
        <p className="mt-2 max-w-lg text-[15px] leading-relaxed text-white/60">{step.description}</p>
      </div>
    </motion.li>
  );
}

/**
 * Línea de tiempo de un remate. Acá sí hay una secuencia real (siete pasos en orden), por eso
 * los números. La línea vertical se va llenando con el scroll y cada paso se enciende al
 * llegar a la mitad de la pantalla.
 */
export function Process() {
  const listRef = useRef<HTMLOListElement>(null);
  const { scrollYProgress }: { scrollYProgress: MotionValue<number> } = useScroll({
    target: listRef,
    offset: ['start 70%', 'end 55%'],
  });
  const fill = useSpring(scrollYProgress, { stiffness: 100, damping: 30, mass: 0.4 });

  return (
    <section id="como-funciona" className="lv2-night lv2-grain relative px-5 py-28 text-white sm:px-8 sm:py-36 lg:px-12">
      <div className="mx-auto grid max-w-[96rem] gap-14 lg:grid-cols-[1fr_1.1fr] lg:gap-24">
        <div className="lg:sticky lg:top-32 lg:self-start">
          <h2 className="lv2-serif text-[clamp(2.4rem,5.2vw,5.2rem)] font-light leading-[1] tracking-[-0.02em]">
            Un remate, de punta a punta.
          </h2>
          <p className="mt-6 max-w-md text-[17px] leading-relaxed text-white/65">
            Desde que la empresa define las reglas hasta que el lote queda adjudicado y empieza el
            seguimiento posventa.
          </p>
          <div className="relative mt-10 hidden aspect-[4/3] max-w-md overflow-hidden rounded-2xl ring-1 ring-white/15 lg:block">
            <img src={STOCK_PHOTOS.atardecer.url} alt={STOCK_PHOTOS.atardecer.alt} loading="lazy" className="h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-[var(--lv2-night)]/70 to-transparent" />
          </div>
        </div>

        <div className="relative lg:pl-8">
          <span aria-hidden="true" className="absolute bottom-0 left-0 top-0 hidden w-px bg-white/15 lg:block" />
          <motion.span
            aria-hidden="true"
            style={{ scaleY: fill }}
            className="absolute bottom-0 left-0 top-0 hidden w-px origin-top bg-brand-400 lg:block"
          />
          <ol ref={listRef} className="divide-y divide-white/10">
            {TIMELINE_STEPS.map((step) => (
              <Step key={step.number} step={step} />
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
