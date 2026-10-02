import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useRef,
  useSyncExternalStore,
} from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { motion, useMotionValue, useReducedMotion, useScroll, useSpring, useTransform } from 'framer-motion';
import { useLandingCta } from '../features/landing/ctaContext';
import { smoothScrollToHash } from '../shared/lib/smoothScrollToHash';

/** Curva "drawer": arranque decidido, frenada larga. */
export const EASE = [0.32, 0.72, 0, 1] as const;
/** Salida fuerte para interacciones de UI. */
export const EASE_OUT = [0.23, 1, 0.32, 1] as const;
/** Curva de montaje cinematográfico: lenta al salir, lenta al llegar. */
export const EASE_CINE = [0.76, 0, 0.18, 1] as const;
export const VIEWPORT = { once: true, margin: '-70px' } as const;

/** Duración de la secuencia de apertura; el hero espera este tiempo antes de entrar. */
export const INTRO_S = 1.9;

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

/** Entrada sobria: sube un poco y aparece. Una sola vez; con reduced-motion solo fade. */
export function Reveal({
  children,
  delay = 0,
  y = 24,
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
      transition={{ duration: 1, ease: EASE, delay }}
    >
      {children}
    </motion.div>
  );
}

/**
 * Titular que entra línea por línea desde una máscara (cada línea dentro de un `overflow-hidden`).
 * El observer va en el contenedor (siempre visible), no en el hijo desplazado.
 */
export function SplitHeading({
  lines,
  className = '',
  delay = 0.05,
  stagger = 0.1,
  as: Tag = 'h2',
  immediate = false,
}: {
  lines: string[];
  className?: string;
  delay?: number;
  stagger?: number;
  as?: 'h1' | 'h2' | 'h3';
  /** `true` para animar al montar (hero) en vez de al entrar en pantalla. */
  immediate?: boolean;
}) {
  const reduce = useReducedMotion();
  const trigger = immediate ? { animate: 'visible' } : { whileInView: 'visible', viewport: VIEWPORT };
  return (
    <Tag className={className} aria-label={lines.join(' ')}>
      {lines.map((line, index) => (
        <motion.span
          key={`${line}-${index}`}
          aria-hidden="true"
          className="block overflow-hidden pb-[0.12em]"
          initial="hidden"
          {...trigger}
        >
          <motion.span
            className="block"
            variants={{
              hidden: { y: reduce ? 0 : '108%', opacity: reduce ? 0 : 1 },
              visible: { y: 0, opacity: 1 },
            }}
            transition={{ duration: 1.25, ease: EASE, delay: delay + index * stagger }}
          >
            {line}
          </motion.span>
        </motion.span>
      ))}
    </Tag>
  );
}

/** Imagen que se descubre con un recorte ascendente y se desplaza más lento que el scroll. */
export function ParallaxImage({
  src,
  alt,
  className = '',
  travel = 8,
}: {
  src: string;
  alt: string;
  className?: string;
  /** Porcentaje de desplazamiento vertical interno. */
  travel?: number;
}) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 1], reduce ? ['0%', '0%'] : [`-${travel}%`, `${travel}%`]);
  return (
    <motion.div
      ref={ref}
      initial={reduce ? { opacity: 0 } : { clipPath: 'inset(100% 0 0 0)' }}
      whileInView={reduce ? { opacity: 1 } : { clipPath: 'inset(0% 0 0 0)' }}
      viewport={{ once: true, margin: '-10%' }}
      transition={{ duration: 1.4, ease: EASE_CINE }}
      className={`overflow-hidden ${className}`}
    >
      <motion.img
        src={src}
        alt={alt}
        loading="lazy"
        draggable={false}
        style={{ y, scale: 1.18 }}
        className="h-full w-full object-cover"
      />
    </motion.div>
  );
}

/** Atrae el contenido hacia el cursor mientras está encima. */
export function Magnetic({ children, className }: { children: ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 200, damping: 16, mass: 0.4 });
  const sy = useSpring(y, { stiffness: 200, damping: 16, mass: 0.4 });
  return (
    <motion.div
      ref={ref}
      className={className}
      style={{ x: sx, y: sy }}
      onPointerMove={(event) => {
        if (reduce || !ref.current || event.pointerType !== 'mouse') return;
        const rect = ref.current.getBoundingClientRect();
        x.set((event.clientX - (rect.left + rect.width / 2)) * 0.14);
        y.set((event.clientY - (rect.top + rect.height / 2)) * 0.2);
      }}
      onPointerLeave={() => {
        x.set(0);
        y.set(0);
      }}
    >
      {children}
    </motion.div>
  );
}

/** Inclinación 3D leve siguiendo al cursor, con resorte. Solo mouse. */
export function Tilt({ children, className = '', max = 5 }: { children: ReactNode; className?: string; max?: number }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const sx = useSpring(px, { stiffness: 110, damping: 15, mass: 0.5 });
  const sy = useSpring(py, { stiffness: 110, damping: 15, mass: 0.5 });
  const rotateY = useTransform(sx, [-0.5, 0.5], [-max, max]);
  const rotateX = useTransform(sy, [-0.5, 0.5], [max, -max]);
  return (
    <div style={{ perspective: 1400 }} className={className}>
      <motion.div
        ref={ref}
        style={{ rotateX, rotateY, transformStyle: 'preserve-3d' }}
        onPointerMove={(event) => {
          if (reduce || !ref.current || event.pointerType !== 'mouse') return;
          const rect = ref.current.getBoundingClientRect();
          px.set((event.clientX - rect.left) / rect.width - 0.5);
          py.set((event.clientY - rect.top) / rect.height - 0.5);
        }}
        onPointerLeave={() => {
          px.set(0);
          py.set(0);
        }}
      >
        {children}
      </motion.div>
    </div>
  );
}

/** Contenedor con resplandor que sigue al cursor (ver `.lv4-spot` en el CSS). */
export function Spot({ children, className = '', style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <div
      className={`lv4-spot ${className}`}
      style={style}
      onPointerMove={(event: ReactPointerEvent<HTMLDivElement>) => {
        const rect = event.currentTarget.getBoundingClientRect();
        event.currentTarget.style.setProperty('--mx', `${event.clientX - rect.left}px`);
        event.currentTarget.style.setProperty('--my', `${event.clientY - rect.top}px`);
      }}
    >
      {children}
    </div>
  );
}

export type CtaTone = 'light' | 'dark' | 'ghostLight' | 'ghostDark';

const CTA_TONES: Record<CtaTone, string> = {
  light: 'border border-white bg-white text-[var(--lv4-ink)] [--lv4-fill:var(--lv4-cobalt)] hover:text-white hover:border-[var(--lv4-cobalt)]',
  dark: 'border border-[var(--lv4-ink)] bg-[var(--lv4-ink)] text-white [--lv4-fill:var(--lv4-cobalt)] hover:border-[var(--lv4-cobalt)]',
  ghostLight: 'border border-white/35 text-white [--lv4-fill:#fff] hover:text-[var(--lv4-ink)] hover:border-white',
  ghostDark: 'border border-[var(--lv4-ink)]/30 text-[var(--lv4-ink)] [--lv4-fill:var(--lv4-ink)] hover:text-white hover:border-[var(--lv4-ink)]',
};

const CTA_BASE =
  'lv4-btn group inline-flex h-[3.25rem] items-center gap-3 whitespace-nowrap rounded-[2px] px-6 text-[14.5px] font-medium';

function CtaInner({ label }: { label: string }) {
  return (
    <>
      {label}
      <ArrowUpRight
        strokeWidth={1.5}
        className="h-[17px] w-[17px] transition-transform duration-500 [transition-timing-function:var(--lv4-ease)] group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
        aria-hidden="true"
      />
    </>
  );
}

/** Botón principal: respeta el destino que define `LandingCtaContext` (login o contacto). */
export function PrimaryCta({ tone = 'light', className = '' }: { tone?: CtaTone; className?: string }) {
  const cta = useLandingCta();
  const classes = `${CTA_BASE} ${CTA_TONES[tone]} ${className}`;
  return (
    <Magnetic className="inline-block">
      {cta.external ? (
        <a href={cta.href} className={classes}>
          <CtaInner label={cta.label} />
        </a>
      ) : (
        <Link to={cta.href} className={classes}>
          <CtaInner label={cta.label} />
        </Link>
      )}
    </Magnetic>
  );
}

/** Ancla interna con scroll suave. */
export function AnchorLink({ href, label, tone = 'ghostLight', className = '' }: { href: string; label: string; tone?: CtaTone; className?: string }) {
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
      <CtaInner label={label} />
    </a>
  );
}

/** Contenedor estándar de sección: ancho máximo y gutters. */
export function Shell({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-[90rem] px-5 sm:px-8 lg:px-14 ${className}`}>{children}</div>;
}

/** Texto pequeño de catálogo: lote, procedencia, pie de foto. Sentence case, sin mayúsculas forzadas. */
export function Caption({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <p className={`text-[13px] leading-snug tracking-[0.01em] ${className}`}>{children}</p>;
}
