import { useEffect, useState } from 'react';

/**
 * Índice que avanza solo cada `ms`. Se frena sólo con `paused` (el crossfade de fotos no es movimiento brusco, y frenarlo por
 * `prefers-reduced-motion` dejaba el fondo "trabado"; el zoom sí se anula en `CinematicShell`). El
 * temporizador se reinicia en cada cambio de índice, así elegir uno a mano no lo salta enseguida.
 */
export function useAutoRotate(length: number, ms: number, paused = false) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (paused || length < 2) return;
    const id = window.setInterval(() => setIndex((i) => (i + 1) % length), ms);
    return () => window.clearInterval(id);
  }, [index, length, ms, paused]);

  return [index, setIndex] as const;
}
