import { Fragment, useRef } from 'react';
import { type MotionValue, motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { MaskLines, Reveal } from '../lib';

/** Párrafo central de la landing original: es el que se "lee" palabra por palabra. */
const WHAT_IS =
  'RematAR es una plataforma para realizar remates online completos, con interacción en tiempo real entre compradores y martilleros. Desde la creación del evento hasta la adjudicación del último lote, todo sucede en vivo, en un mismo lugar.';

/** Cierre del pensamiento: por qué el sistema existe más allá de la puja. */
const SUPPORT =
  'Un remate dura minutos. Lo que pasa alrededor — armar el catálogo, conducir la sala, cobrar y entregar — lleva semanas. RematAR lo junta en un solo sistema, para que cada lote tenga su momento y todos lo vean al mismo tiempo.';

function Word({ word, progress, range }: { word: string; progress: MotionValue<number>; range: [number, number] }) {
  const opacity = useTransform(progress, range, [0.14, 1]);
  return (
    <motion.span style={{ opacity }} className="inline-block">
      {word}
    </motion.span>
  );
}

/**
 * Declaración editorial: el titular pregunta y el párrafo central se "lee" palabra por
 * palabra a medida que se scrollea. Con `prefers-reduced-motion` se muestra completo.
 */
export function Manifesto() {
  const ref = useRef<HTMLParagraphElement>(null);
  const reduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 0.85', 'end 0.55'] });
  const words = WHAT_IS.split(' ');

  return (
    <section id="nosotros" className="lv3-paper relative px-5 py-28 sm:px-8 sm:py-40 lg:px-12">
      <div className="mx-auto max-w-[80rem]">
        <Reveal>
          <h2 className="lv3-serif max-w-4xl text-[clamp(2.4rem,5.6vw,5.6rem)] font-light leading-[1] tracking-[-0.02em] text-ink">
            <MaskLines lines={['¿Qué es RematAR?']} delay={0} />
          </h2>
        </Reveal>

        <p
          ref={ref}
          className="lv3-serif mt-14 text-[clamp(1.7rem,3.6vw,3.4rem)] font-light leading-[1.22] tracking-[-0.015em] text-ink"
        >
          {words.map((word, index) => (
            <Fragment key={index}>
              {index > 0 ? ' ' : null}
              {reduceMotion ? (
                <span className="inline-block">{word}</span>
              ) : (
                <Word
                  word={word}
                  progress={scrollYProgress}
                  range={[index / words.length, Math.min(1, (index + 3) / words.length)]}
                />
              )}
            </Fragment>
          ))}
        </p>

        <Reveal delay={0.1}>
          <div className="mt-16 grid gap-8 border-t border-line-strong pt-8 lg:grid-cols-[0.4fr_1fr] lg:gap-14">
            <p className="text-sm font-medium uppercase tracking-[0.14em] text-ink-faint">
              Del catálogo a la entrega
            </p>
            <p className="max-w-2xl text-[17px] leading-relaxed text-ink-muted">{SUPPORT}</p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
