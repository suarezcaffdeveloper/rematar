import { useEffect, useRef, useState } from 'react';
import { useInView, useReducedMotion } from 'framer-motion';

export interface AnimatedCounterProps {
  value: number;
  suffix?: string;
  prefix?: string;
  durationMs?: number;
  className?: string;
}

/**
 * Contador que cuenta desde 0 hasta `value` cuando entra en viewport. `useReducedMotion`
 * salta directo al valor final -- para animaciones de conteo el "movimiento" en sí (los
 * números cambiando rápido) es lo que puede molestar, no sólo el desplazamiento.
 */
export function AnimatedCounter({ value, suffix = '', prefix = '', durationMs = 1500, className }: AnimatedCounterProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-80px' });
  const prefersReducedMotion = useReducedMotion();
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!isInView) return;
    if (prefersReducedMotion) {
      setDisplay(value);
      return;
    }

    let frame: number;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / durationMs);
      const eased = 1 - (1 - progress) * (1 - progress);
      setDisplay(Math.round(eased * value));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [isInView, prefersReducedMotion, value, durationMs]);

  return (
    <span ref={ref} className={className}>
      {prefix}
      {display}
      {suffix}
    </span>
  );
}
