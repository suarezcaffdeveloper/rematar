import { motion, useReducedMotion } from 'framer-motion';
import { NAV_LINKS } from '../../features/landing/data';
import { smoothScrollToHash } from '../../shared/lib/smoothScrollToHash';
import { AnchorLink, EASE, PrimaryCta } from '../lib';

const RINGS = [0, 1, 2, 3];

/**
 * Cierre sin fotografía: sobre un azul de marca profundo, el golpe del martillo se dibuja como
 * ondas concéntricas que se expanden desde el centro (puro CSS, sin imagen). Con
 * `prefers-reduced-motion` las ondas quedan quietas. Debajo, el pie con la marca gigante.
 */
export function Closing() {
  const reduceMotion = useReducedMotion();

  return (
    <footer className="lv2-grain relative isolate overflow-hidden bg-[#050816] text-white">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            'radial-gradient(70% 60% at 50% 38%, rgba(36,81,242,0.55) 0%, rgba(20,44,125,0.35) 38%, rgba(5,8,22,0) 72%)',
        }}
      />

      <div className="relative mx-auto flex min-h-[44rem] max-w-[96rem] flex-col items-center justify-center px-5 pb-16 pt-36 text-center sm:px-8 sm:pt-44 lg:px-12">
        <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-[44%] -z-10 -translate-x-1/2 -translate-y-1/2">
          {RINGS.map((ring) => (
            <span
              key={ring}
              className="absolute left-1/2 top-1/2 block aspect-square w-[min(90vw,52rem)] -translate-x-1/2 -translate-y-1/2 rounded-full border border-brand-300/40"
              style={
                reduceMotion
                  ? { transform: `translate(-50%, -50%) scale(${0.35 + ring * 0.22})`, opacity: 0.5 - ring * 0.1 }
                  : { animation: `lv2-ring 7.2s cubic-bezier(0.16, 0.7, 0.3, 1) ${ring * 1.8}s infinite` }
              }
            />
          ))}
        </div>

        <motion.h2
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 1, ease: EASE }}
          className="lv2-serif max-w-5xl text-[clamp(3rem,7.6vw,7.6rem)] font-light leading-[0.98] tracking-[-0.025em]"
        >
          El próximo martillo puede sonar acá.
        </motion.h2>
        <p className="mt-7 max-w-lg text-[17px] leading-relaxed text-white/70">
          Coordinemos una demo guiada con un remate de prueba y mirá la experiencia completa de empresa,
          martillero y comprador.
        </p>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <PrimaryCta />
          <a
            href="/demo.html"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-12 items-center justify-center rounded-full bg-white/10 px-7 text-[15px] font-semibold text-white ring-1 ring-inset ring-white/30 backdrop-blur transition-colors hover:bg-white/20"
          >
            Probar la demo
          </a>
          <AnchorLink href="#faq" tone="glass" className="!bg-transparent !ring-0 hover:!bg-white/10">
            Leer las preguntas frecuentes
          </AnchorLink>
        </div>
      </div>

      <div className="mx-auto max-w-[96rem] px-5 sm:px-8 lg:px-12">
        <div className="flex flex-col gap-8 border-t border-white/15 pt-8 sm:flex-row sm:items-end sm:justify-between">
          <p className="max-w-xs text-sm leading-relaxed text-white/60">
            La plataforma para organizar, conducir y participar en remates en tiempo real.
          </p>
          <nav className="flex flex-wrap gap-x-6 gap-y-2" aria-label="Pie de página">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={(event) => {
                  event.preventDefault();
                  smoothScrollToHash(link.href);
                  window.history.pushState(null, '', link.href);
                }}
                className="text-sm font-medium text-white/70 transition-colors hover:text-white"
              >
                {link.label}
              </a>
            ))}
          </nav>
        </div>
      </div>

      <div
        aria-hidden="true"
        className="lv2-serif pointer-events-none mt-16 select-none overflow-hidden whitespace-nowrap px-4 text-center text-[clamp(5rem,26vw,28rem)] font-light leading-[0.78] tracking-[-0.05em] text-white/[0.07]"
      >
        RematAR
      </div>
      <p className="relative px-5 pb-6 pt-4 text-center text-xs text-white/40">© 2026 RematAR. Todos los derechos reservados.</p>
    </footer>
  );
}
