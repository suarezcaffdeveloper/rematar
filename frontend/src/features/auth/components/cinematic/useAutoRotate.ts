import { useEffect, useState } from 'react';
import { useReducedMotion } from 'framer-motion';

/**
 * Índice que avanza solo cada `ms`. Se frena con `paused` o `prefers-reduced-motion`; el
 * temporizador se reinicia en cada cambio de índice, así elegir uno a mano no lo salta enseguida.
 */
export function useAutoRotate(length: number, ms: number, paused = false) {
  const reduceMotion = useReducedMotion();
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (paused || reduceMotion || length < 2) return;
    const id = window.setInterval(() => setIndex((i) => (i + 1) % length), ms);
    return () => window.clearInterval(id);
  }, [index, length, ms, paused, reduceMotion]);

  return [index, setIndex] as const;
}
