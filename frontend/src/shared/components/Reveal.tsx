import type { ReactNode } from 'react';
import { motion, useReducedMotion, type Variants } from 'framer-motion';

export interface RevealProps {
  children: ReactNode;
  /** Retraso en segundos, para escalonar varios `Reveal` seguidos (cards de una grilla, etc). */
  delay?: number;
  className?: string;
  /** `up` (default) entra desde abajo; `left`/`right` entran deslizando desde ese costado
   * (para bloques que ya están ubicados a un lado, como en `BenefitsSection`); `none` sólo
   * hace fade, sin desplazamiento -- para elementos anchos donde un slide se ve raro (ej.
   * una franja de texto larga). */
  direction?: 'up' | 'left' | 'right' | 'none';
}

const DISTANCE = 24;
const SIDE_DISTANCE = 56;

/**
 * Wrapper de "aparición al hacer scroll" (fade + slide), usado en la landing
 * (`features/landing`) y en el registro (`features/auth/pages/RegisterPage.tsx`) en
 * vez de repetir la misma config de Framer Motion en cada lugar. `useReducedMotion`
 * desactiva el desplazamiento para quien prefiere menos movimiento -- la regla CSS
 * global de `styles/index.css` (`prefers-reduced-motion`) no alcanza acá porque
 * Framer Motion anima vía JS, no vía transiciones CSS.
 */
export function Reveal({ children, delay = 0, className, direction = 'up' }: RevealProps) {
  const prefersReducedMotion = useReducedMotion();
  const offset = prefersReducedMotion
    ? { x: 0, y: 0 }
    : direction === 'up'
      ? { x: 0, y: DISTANCE }
      : direction === 'left'
        ? { x: -SIDE_DISTANCE, y: 0 }
        : direction === 'right'
          ? { x: SIDE_DISTANCE, y: 0 }
          : { x: 0, y: 0 };

  const variants: Variants = {
    hidden: { opacity: 0, x: offset.x, y: offset.y },
    visible: {
      opacity: 1,
      x: 0,
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
