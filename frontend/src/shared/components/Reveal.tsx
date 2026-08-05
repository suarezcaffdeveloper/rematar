import type { ReactNode } from 'react';
import { motion, useReducedMotion, type Variants } from 'framer-motion';

export interface RevealProps {
  children: ReactNode;
  /** Retraso en segundos, para escalonar varios `Reveal` seguidos (cards de una grilla, etc). */
  delay?: number;
  className?: string;
  /** `up` (default) entra desde abajo; `none` sólo hace fade, sin desplazamiento -- para
   * elementos anchos donde un slide vertical se ve raro (ej. una franja de texto larga). */
  direction?: 'up' | 'none';
}

const DISTANCE = 24;

/**
 * Wrapper de "aparición al hacer scroll" (fade + slide-up), usado en la landing
 * (`features/landing`) y en el registro (`features/auth/pages/RegisterPage.tsx`) en
 * vez de repetir la misma config de Framer Motion en cada lugar. `useReducedMotion`
 * desactiva el desplazamiento para quien prefiere menos movimiento -- la regla CSS
 * global de `styles/index.css` (`prefers-reduced-motion`) no alcanza acá porque
 * Framer Motion anima vía JS, no vía transiciones CSS.
 */
export function Reveal({ children, delay = 0, className, direction = 'up' }: RevealProps) {
  const prefersReducedMotion = useReducedMotion();
  const distance = prefersReducedMotion ? 0 : direction === 'up' ? DISTANCE : 0;

  const variants: Variants = {
    hidden: { opacity: 0, y: distance },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.6, delay, ease: [0.21, 0.47, 0.32, 0.98] },
    },
  };

  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-80px' }}
      variants={variants}
    >
      {children}
    </motion.div>
  );
}
