import { useEffect, useRef, useState } from 'react';
import { animate, motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { RUBRO_PANELS } from '../data';
import { EASE_OUT, Reveal, Shell, SplitHeading } from '../lib';

const CARD_GAP = 20;

/**
 * Láminas de catálogo, una por rubro, en un carrusel arrastrable (mouse, dedo, flechas) con
 * inercia. Al pasar el cursor por una lámina la foto queda en penumbra salvo donde apunta, como
 * una luz de galería. Sobre el carril una burbuja "Arrastrá" sigue al cursor.
 */
export function Rubros() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const [limit, setLimit] = useState(0);
  const limitRef = useRef(0);
  const [cardWidth, setCardWidth] = useState(360);
  const [hovering, setHovering] = useState(false);

  const cx = useSpring(useMotionValue(0), { stiffness: 400, damping: 32, mass: 0.4 });
  const cy = useSpring(useMotionValue(0), { stiffness: 400, damping: 32, mass: 0.4 });
  const progress = useTransform(x, (value) => (limitRef.current ? Math.min(1, Math.max(0, -value / limitRef.current)) : 0));
  const barScale = useTransform(progress, [0, 1], [0.1, 1]);

  useEffect(() => {
    const measure = () => {
      const viewport = viewportRef.current;
      const track = trackRef.current;
      if (!viewport || !track) return;
      limitRef.current = Math.max(0, track.scrollWidth - viewport.clientWidth);
      setLimit(limitRef.current);
      const firstCard = track.firstElementChild as HTMLElement | null;
      if (firstCard) setCardWidth(firstCard.offsetWidth);
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (viewportRef.current) observer.observe(viewportRef.current);
    return () => observer.disconnect();
  }, []);

  const slide = (direction: 1 | -1) => {
    const target = Math.max(-limit, Math.min(0, x.get() - direction * (cardWidth + CARD_GAP) * 1.5));
    animate(x, target, { type: 'spring', duration: 0.9, bounce: 0.08 });
  };

  const arrow =
    'lv4-btn grid h-12 w-12 place-items-center rounded-[2px] border border-white/25 text-white [--lv4-fill:#fff] hover:text-[var(--lv4-ink)]';

  return (
    <section id="rubros" className="lv4-dark py-24 sm:py-32 lg:py-44">
      <Shell>
        <div className="flex flex-col justify-between gap-10 lg:flex-row lg:items-end">
          <SplitHeading
            lines={['Nueve rubros.', 'Un mismo sistema.']}
            className="lv4-serif text-[clamp(2.8rem,6.4vw,6.2rem)] leading-[0.95]"
          />
          <Reveal delay={0.2} className="flex items-end justify-between gap-8 lg:justify-end">
            <p className="max-w-xs text-[16px] leading-relaxed text-white/60">
              Del campo al taller, de la casa a la joya. El mismo flujo de remate para cada categoría.
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={() => slide(-1)} aria-label="Rubros anteriores" className={arrow}>
                <ArrowLeft className="h-5 w-5" strokeWidth={1.25} aria-hidden="true" />
              </button>
              <button type="button" onClick={() => slide(1)} aria-label="Más rubros" className={arrow}>
                <ArrowRight className="h-5 w-5" strokeWidth={1.25} aria-hidden="true" />
              </button>
            </div>
          </Reveal>
        </div>
      </Shell>

      <div
        ref={viewportRef}
        className="relative mt-14 overflow-hidden pl-5 sm:pl-8 lg:mt-20 lg:pl-[max(3.5rem,calc((100vw-90rem)/2+3.5rem))]"
        onPointerMove={(event) => {
          if (event.pointerType !== 'mouse') return;
          const rect = event.currentTarget.getBoundingClientRect();
          cx.set(event.clientX - rect.left);
          cy.set(event.clientY - rect.top);
          if (!hovering) setHovering(true);
        }}
        onPointerLeave={() => setHovering(false)}
      >
        <motion.div
          ref={trackRef}
          drag="x"
          dragConstraints={{ left: -limit, right: 0 }}
          dragElastic={0.1}
          dragTransition={{ power: 0.25, timeConstant: 280 }}
          style={{ x }}
          className="flex w-max cursor-grab gap-5 pr-5 active:cursor-grabbing sm:pr-8 lg:pr-14"
        >
          {RUBRO_PANELS.map((rubro, index) => (
            <motion.article
              key={rubro.key}
              initial={{ opacity: 0, y: 70 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '0px 0px -8% 0px' }}
              transition={{ duration: 1.1, ease: EASE_OUT, delay: Math.min(index, 4) * 0.08 }}
              className="lv4-gallery-card group w-[17rem] shrink-0 sm:w-[21rem]"
              onPointerMove={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                event.currentTarget.style.setProperty('--mx', `${event.clientX - rect.left}px`);
                event.currentTarget.style.setProperty('--my', `${event.clientY - rect.top - 0}px`);
              }}
            >
              <div className="relative aspect-[3/4] overflow-hidden border border-white/10 bg-[var(--lv4-night)]">
                <img
                  src={rubro.photo.url}
                  alt={rubro.photo.alt}
                  loading="lazy"
                  draggable={false}
                  className="absolute inset-0 h-full w-full object-cover transition-transform duration-[1400ms] [transition-timing-function:var(--lv4-ease)] group-hover:scale-[1.07]"
                />
                <div className="absolute inset-0 bg-[var(--lv4-ink)]/35 transition-opacity duration-500 [transition-timing-function:var(--lv4-ease-out)] group-hover:opacity-0" />
                <div className="lv4-gallery-light absolute inset-0" />
              </div>
              <div className="relative mt-4 pb-3">
                <h3 className="lv4-serif text-[1.9rem] leading-none">{rubro.name}</h3>
                <p className="mt-2 text-[14px] text-white/55">{rubro.example}</p>
                <span className="absolute inset-x-0 bottom-0 block h-px origin-left scale-x-0 bg-white transition-transform duration-700 [transition-timing-function:var(--lv4-ease)] group-hover:scale-x-100" />
                <span className="absolute inset-x-0 bottom-0 -z-0 block h-px bg-white/15" />
              </div>
            </motion.article>
          ))}
        </motion.div>

        <motion.div aria-hidden="true" style={{ x: cx, y: cy }} className="pointer-events-none absolute left-0 top-0 z-10 hidden md:block">
          <motion.div
            animate={{ scale: hovering ? 1 : 0.5, opacity: hovering ? 1 : 0 }}
            transition={{ duration: 0.4, ease: EASE_OUT }}
            className="-ml-10 -mt-10 grid h-20 w-20 place-items-center rounded-full border border-white/50 bg-[var(--lv4-ink)]/50 text-[13px] text-white backdrop-blur-sm"
          >
            Arrastrá
          </motion.div>
        </motion.div>
      </div>

      <Shell className="mt-12">
        <div className="h-px bg-white/15" aria-hidden="true">
          <motion.div style={{ scaleX: barScale }} className="h-px origin-left bg-white" />
        </div>
      </Shell>
    </section>
  );
}
