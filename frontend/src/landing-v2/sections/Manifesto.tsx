import { useRef } from 'react';
import { type MotionValue, motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { AnimatedCounter } from '../../features/landing/components/AnimatedCounter';

const TEXT =
  'Un remate dura minutos. Lo que pasa alrededor — armar el catálogo, conducir la sala, cobrar y entregar — lleva semanas. RematAR lo junta en un solo sistema, para que cada lote tenga su momento y todos lo vean al mismo tiempo.';

const FACTS = [
  { value: 9, suffix: '', label: 'rubros conviven en el mismo sistema' },
  { value: 3, suffix: '', label: 'paneles, uno por cada rol del remate' },
  { value: 100, suffix: '%', label: 'en tiempo real, sin recargar la página' },
];

function Word({ word, progress, range }: { word: string; progress: MotionValue<number>; range: [number, number] }) {
  const opacity = useTransform(progress, range, [0.14, 1]);
  return (
    <motion.span style={{ opacity }} className="inline-block pr-[0.28em]">
      {word}
    </motion.span>
  );
}

/**
 * Declaración editorial: el texto se "lee" palabra por palabra a medida que se scrollea.
 * Con `prefers-reduced-motion` se muestra completo desde el principio.
 */
export function Manifesto() {
  const ref = useRef<HTMLParagraphElement>(null);
  const reduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 0.85', 'end 0.55'] });
  const words = TEXT.split(' ');

  return (
    <section id="nosotros" className="lv2-paper relative px-5 py-28 sm:px-8 sm:py-40 lg:px-12">
      <div className="mx-auto max-w-[80rem]">
        <p className="mb-10 text-sm font-medium text-ink-muted">Qué es RematAR</p>
        <p
          ref={ref}
          className="lv2-serif text-[clamp(1.9rem,4.6vw,4.4rem)] font-light leading-[1.1] tracking-[-0.015em] text-ink"
        >
          {words.map((word, index) =>
            reduceMotion ? (
              <span key={index} className="inline-block pr-[0.28em]">
                {word}
              </span>
            ) : (
              <Word
                key={index}
                word={word}
                progress={scrollYProgress}
                range={[index / words.length, Math.min(1, (index + 3) / words.length)]}
              />
            ),
          )}
        </p>

        <dl className="mt-24 grid gap-10 border-t border-line-strong pt-10 sm:grid-cols-3 sm:gap-8">
          {FACTS.map((fact) => (
            <div key={fact.label}>
              <dt className="lv2-serif text-6xl font-light tabular-nums tracking-tight text-ink sm:text-7xl">
                <AnimatedCounter value={fact.value} suffix={fact.suffix} />
              </dt>
              <dd className="mt-3 max-w-[16rem] text-[15px] leading-snug text-ink-muted">{fact.label}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
