import { useRef } from 'react';
import { type MotionValue, motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { AnimatedCounter } from '../../features/landing/components/AnimatedCounter';
import { STATEMENT } from '../data';
import { Caption, ParallaxImage, Reveal, Shell } from '../lib';
import { STOCK_PHOTOS } from '../../shared/media/stockPhotos';

const WORDS = `RematAR es ${STATEMENT.charAt(0).toLowerCase()}${STATEMENT.slice(1)}`.split(' ');

const FACTS = [
  { value: 100, suffix: '%', label: 'de la puja en tiempo real' },
  { value: 9, suffix: '', label: 'rubros en un mismo sistema' },
  { value: 3, suffix: '', label: 'roles dentro de cada remate' },
];

function Word({ word, index, progress }: { word: string; index: number; progress: MotionValue<number> }) {
  const start = index / WORDS.length;
  const end = Math.min(1, start + 1.8 / WORDS.length);
  const opacity = useTransform(progress, [start, end], [0.18, 1]);
  return (
    <motion.span style={{ opacity }} className="inline-block">
      {word}
      {' '}
    </motion.span>
  );
}

/** Apertura editorial sobre papel: texto que se "enciende" al leer, cifras y una fotografía con pie. */
export function Statement() {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 0.8', 'end 0.6'] });

  return (
    <section id="nosotros" ref={ref} className="lv4-paper py-24 sm:py-32 lg:py-44">
      <Shell className="grid gap-16 lg:grid-cols-[1.25fr_0.75fr] lg:gap-24">
        <div>
          <p
            className="lv4-serif max-w-[46rem] text-[clamp(2rem,4vw,3.7rem)] leading-[1.1]"
            aria-label={WORDS.join(' ')}
          >
            {reduce
              ? WORDS.join(' ')
              : WORDS.map((word, index) => <Word key={`${word}-${index}`} word={word} index={index} progress={scrollYProgress} />)}
          </p>

          <dl className="mt-16 grid grid-cols-3 border-t border-[var(--lv4-line-light)] lg:mt-24">
            {FACTS.map((fact, index) => (
              <Reveal key={fact.label} delay={0.1 + index * 0.1} className={`pt-6 ${index ? 'border-l border-[var(--lv4-line-light)] pl-5 sm:pl-8' : ''}`}>
                <dt className="sr-only">{fact.label}</dt>
                <dd className="lv4-serif lv4-num text-[clamp(3rem,6vw,5.6rem)] leading-none">
                  <AnimatedCounter value={fact.value} suffix={fact.suffix} durationMs={1800} />
                </dd>
                <p aria-hidden="true" className="mt-3 max-w-[11rem] text-[13px] leading-snug text-[var(--lv4-ink)]/60">
                  {fact.label}
                </p>
              </Reveal>
            ))}
          </dl>
        </div>

        <figure className="lg:pt-24">
          <ParallaxImage
            src={STOCK_PHOTOS.ganado.url}
            alt={STOCK_PHOTOS.ganado.alt}
            className="aspect-[4/5] w-full"
          />
          <figcaption className="mt-4 flex items-baseline justify-between gap-4 border-t border-[var(--lv4-line-light)] pt-3">
            <Caption className="text-[var(--lv4-ink)]/60">Remate de hacienda general, lote 12.</Caption>
            <Caption className="shrink-0 text-[var(--lv4-ink)]/40">Sala en vivo</Caption>
          </figcaption>
        </figure>
      </Shell>
    </section>
  );
}
