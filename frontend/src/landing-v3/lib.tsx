import { type ReactNode, useRef, useSyncExternalStore } from 'react';
import { Link } from 'react-router-dom';
import { motion, useMotionValue, useReducedMotion, useSpring } from 'framer-motion';
import { useLandingCta } from '../features/landing/ctaContext';
import { smoothScrollToHash } from '../shared/lib/smoothScrollToHash';

/** Curva "expo out": arranque rápido, frenada larga. Es la misma que usan los paneles. */
export const EASE = [0.16, 1, 0.3, 1] as const;

/** Margen con el que un elemento se considera "entró en pantalla". */
export const VIEWPORT = { once: true, margin: '-80px' } as const;

export function formatUsd(value: number): string {
  return `US$ ${value.toLocaleString('es-AR')}`;
}

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (notify) => {
      const media = window.matchMedia(query);
      media.addEventListener('change', notify);
      return () => media.removeEventListener('change', notify);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/**
 * Reveal de entrada: desplazamiento corto + desvanecido, una sola vez por elemento.
 * Con `prefers-reduced-motion` el contenido queda quieto y visible.
 */
export function Reveal({
  children,
  delay = 0,
  y = 20,
  className = '',
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={VIEWPORT}
      transition={{ duration: 0.8, ease: EASE, delay }}
    >
      {children}
    </motion.div>
  );
}

/**
 * Titular que se revela línea por línea desde una máscara (cada línea dentro de un
 * `overflow-hidden` que desliza hacia arriba). Es el gesto editorial de la página:
 * el titular nunca "aparece", entra.
 */
export function MaskLines({
  lines,
  className = '',
  delay = 0.15,
  stagger = 0.09,
  italicFrom,
}: {
  lines: string[];
  className?: string;
  delay?: number;
  stagger?: number;
  /** Índice a partir del cual las líneas se componen en itálica (gesto editorial). */
  italicFrom?: number;
}) {
  const reduce = useReducedMotion();
  return (
    <span className={className}>
      {lines.map((line, index) => (
        // El observer va en la máscara (siempre en pantalla): si se observara al hijo
        // desplazado 110% quedaría siempre "recortado" y whileInView nunca dispararía.
        <motion.span
          key={line}
          className="block overflow-hidden pb-[0.08em]"
          initial="hidden"
          whileInView="visible"
          viewport={VIEWPORT}
        >
          <motion.span
            className={`block ${italicFrom !== undefined && index >= italicFrom ? 'italic' : ''}`}
            variants={{ hidden: { y: reduce ? 0 : '110%', opacity: reduce ? 0 : 1 }, visible: { y: 0, opacity: 1 } }}
            transition={{ duration: 1, ease: EASE, delay: delay + index * stagger }}
          >
            {line}
          </motion.span>
        </motion.span>
      ))}
    </span>
  );
}

/** Desplaza el contenido hacia el cursor mientras está encima (botones principales). */
export function Magnetic({ children, className }: { children: ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 220, damping: 16, mass: 0.4 });
  const sy = useSpring(y, { stiffness: 220, damping: 16, mass: 0.4 });

  return (
    <motion.div
      ref={ref}
      className={className}
      style={{ x: sx, y: sy }}
      onMouseMove={(event) => {
        if (reduce || !ref.current) return;
        const rect = ref.current.getBoundingClientRect();
        x.set((event.clientX - (rect.left + rect.width / 2)) * 0.22);
        y.set((event.clientY - (rect.top + rect.height / 2)) * 0.3);
      }}
      onMouseLeave={() => {
        x.set(0);
        y.set(0);
      }}
    >
      {children}
    </motion.div>
  );
}

type CtaTone = 'light' | 'brand' | 'glass' | 'ink';

const CTA_TONES: Record<CtaTone, string> = {
  light: 'bg-white text-ink hover:bg-brand-50',
  brand:
    'bg-brand-600 text-white shadow-[0_10px_30px_-10px_rgba(36,81,242,0.8)] hover:bg-brand-500',
  glass: 'bg-white/10 text-white ring-1 ring-inset ring-white/30 backdrop-blur hover:bg-white/20',
  ink: 'bg-ink text-white hover:bg-brand-600',
};

const CTA_BASE =
  'inline-flex h-12 items-center justify-center gap-2 whitespace-nowrap rounded-full px-7 text-[15px] font-semibold v3-press transition-colors';

/** Botón principal: respeta el destino que define `LandingCtaContext` (login o contacto). */
export function PrimaryCta({ tone = 'light', className = '' }: { tone?: CtaTone; className?: string }) {
  const cta = useLandingCta();
  const classes = `${CTA_BASE} ${CTA_TONES[tone]} ${className}`;
  return (
    <Magnetic className="inline-block">
      {cta.external ? (
        <a href={cta.href} className={classes}>
          {cta.label}
        </a>
      ) : (
        <Link to={cta.href} className={classes}>
          {cta.label}
        </Link>
      )}
    </Magnetic>
  );
}

/** Ancla interna con scroll suave (mismo comportamiento que la navbar actual). */
export function AnchorLink({
  href,
  children,
  className = '',
  tone = 'glass',
}: {
  href: string;
  children: ReactNode;
  className?: string;
  tone?: CtaTone;
}) {
  return (
    <a
      href={href}
      onClick={(event) => {
        event.preventDefault();
        smoothScrollToHash(href);
        window.history.pushState(null, '', href);
      }}
      className={`${CTA_BASE} ${CTA_TONES[tone]} ${className}`}
    >
      {children}
    </a>
  );
}
