import { useRef } from 'react';
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import logoRematar from '../../assets/brand/logo-rematar.png';
import { NAV_LINKS } from '../../features/landing/data';
import { STOCK_PHOTOS } from '../../shared/media/stockPhotos';
import { smoothScrollToHash } from '../../shared/lib/smoothScrollToHash';
import { AnchorLink, EASE, PrimaryCta, Reveal, Shell, SplitHeading } from '../lib';

/**
 * Cierre: un atardecer en el campo, muy oscurecido, y un haz de luz que respira sobre el atril.
 * La fotografía se desplaza más lento que el scroll. Debajo, el pie con la marca gigante.
 */
export function Closing() {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end end'] });
  const photoY = useTransform(scrollYProgress, [0, 1], reduce ? ['0%', '0%'] : ['-10%', '0%']);

  return (
    <footer ref={ref} id="cierre" className="lv4-dark relative isolate overflow-hidden">
      <motion.div style={{ y: photoY }} aria-hidden="true" className="absolute -top-[10%] bottom-0 left-0 right-0 -z-10">
        <img src={STOCK_PHOTOS.atardecer.url} alt="" loading="lazy" className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-[var(--lv4-ink)]/75" />
        <div className="absolute inset-0 bg-gradient-to-b from-[var(--lv4-ink)] via-transparent to-[var(--lv4-ink)]" />
        <div className="lv4-vignette absolute inset-0" />
        <div
          className="lv4-beam absolute left-1/2 top-0 h-[85%] w-[60%] -translate-x-1/2"
          style={{ background: 'conic-gradient(from 180deg at 50% 0%, transparent 168deg, rgba(157,179,250,0.28) 180deg, transparent 192deg)' }}
        />
      </motion.div>

      <Shell className="flex min-h-[44rem] flex-col items-center justify-center pb-16 pt-36 text-center sm:pt-44">
        <SplitHeading
          lines={['¿Listo para tu', 'primer remate?']}
          className="lv4-serif text-[clamp(3.2rem,9vw,8.6rem)] leading-[0.92]"
        />
        <Reveal delay={0.35}>
          <p className="mx-auto mt-8 max-w-md text-[17px] leading-relaxed text-white/75">
            Creá tu cuenta, armá tu catálogo y viví la puja en tiempo real.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <PrimaryCta tone="light" />
            <AnchorLink href="#faq" label="Ver preguntas frecuentes" tone="ghostLight" />
          </div>
        </Reveal>
      </Shell>

      <Shell>
        <nav aria-label="Pie de página" className="flex flex-wrap items-center justify-between gap-6 border-t border-white/15 py-8">
          <img src={logoRematar} alt="RematAR" className="h-6 w-auto brightness-0 invert" />
          <ul className="flex flex-wrap gap-x-8 gap-y-3 text-[14px] text-white/65">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  onClick={(event) => {
                    event.preventDefault();
                    smoothScrollToHash(link.href);
                    window.history.pushState(null, '', link.href);
                  }}
                  className="transition-colors duration-300 hover:text-white"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
          <p className="text-[13px] text-white/45">© {new Date().getFullYear()} RematAR</p>
        </nav>
      </Shell>

      <div aria-hidden="true" className="pointer-events-none select-none overflow-hidden">
        <div className="lv4-serif flex justify-center text-[clamp(6rem,27vw,30rem)] leading-[0.8] text-transparent" style={{ WebkitTextStroke: '1px rgba(255,255,255,0.22)' }}>
          {'RematAR'.split('').map((letter, index) => (
            <motion.span
              key={`${letter}-${index}`}
              initial={{ y: '45%', opacity: 0 }}
              whileInView={{ y: 0, opacity: 1 }}
              viewport={{ once: true, margin: '-5%' }}
              transition={{ duration: 1.3, ease: EASE, delay: index * 0.07 }}
              className="inline-block"
            >
              {letter}
            </motion.span>
          ))}
        </div>
      </div>
    </footer>
  );
}
