import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';

export interface AnimatedCounterProps {
  value: number;
  suffix?: string;
  prefix?: string;
  durationMs?: number;
  className?: string;
}

const VIEWPORT_MARGIN_PX = 80;

/** `true` si `el` ya está a la vista, con el mismo margen que usaba el `-80px` de
 * `IntersectionObserver`/`useInView` (dispara un poco antes de que el borde entre del
 * todo). Sin `IntersectionObserver`: ver el comentario grande de más abajo. */
function isElementInViewport(el: Element): boolean {
  const rect = el.getBoundingClientRect();
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
  return rect.top < viewportHeight - VIEWPORT_MARGIN_PX && rect.bottom > VIEWPORT_MARGIN_PX;
}

/**
 * Contador que cuenta desde 0 hasta `value` cuando entra en viewport.
 *
 * Chequeo de visibilidad por scroll/resize + `getBoundingClientRect()`, no
 * `IntersectionObserver` (ni el `useInView` de framer-motion que envuelve lo mismo, que
 * es lo que tenía antes este componente): reproducido en Chromium, cuando varios
 * observers se crean casi al mismo tiempo durante el commit de React (exactamente el
 * caso acá -- los 3 contadores de `HeroSection` montan juntos, más los que ya vienen
 * montando el resto de la landing), el PRIMERO de esa tanda deja de recibir callbacks
 * después de la entrega inicial (la que reporta "todavía no visible") -- nunca llega a
 * enterarse de que después sí entró en pantalla, así que se queda pegado en 0. Se
 * confirmó moviendo cuál contador iba primero en el DOM: el que rompía era siempre el
 * primero en montar, sin importar cuál fuera ni sus props -- no es un bug de este
 * componente en particular, es el navegador perdiendo notificaciones del primer
 * observer de un lote creado junto. En desktop no se nota porque los contadores suelen
 * entrar en viewport ya en el primer render (sin necesidad de scrollear), así que ese
 * primer callback perdido ya reporta "visible" y alcanza.
 *
 * `useReducedMotion` salta directo al valor final -- para animaciones de conteo el
 * "movimiento" en sí (los números cambiando rápido) es lo que puede molestar, no sólo el
 * desplazamiento.
 */
export function AnimatedCounter({ value, suffix = '', prefix = '', durationMs = 1500, className }: AnimatedCounterProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const prefersReducedMotion = useReducedMotion();
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Variable local al efecto (no un `useRef`) a propósito: solo tiene que evitar un
    // doble disparo DENTRO de este mismo montaje (el chequeo inicial síncrono y el
    // listener de scroll compitiendo). Si viviera en un `useRef` que sobrevive entre
    // montajes, el doble-invocado de efectos de StrictMode (dev) dejaría el segundo
    // montaje "ya animado" según el primero -- exactamente el bug que tenía este
    // componente antes con `IntersectionObserver` (ver el comentario grande de arriba).
    let hasAnimated = false;

    const startCountUp = () => {
      if (prefersReducedMotion) {
        setDisplay(value);
        return () => undefined;
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
    };

    let cleanupAnimation: (() => void) | undefined;
    let rafId: number | null = null;

    const check = () => {
      rafId = null;
      if (hasAnimated || !isElementInViewport(el)) return;
      hasAnimated = true;
      cleanupAnimation = startCountUp();
      window.removeEventListener('scroll', onScrollOrResize);
      window.removeEventListener('resize', onScrollOrResize);
    };

    function onScrollOrResize() {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(check);
    }

    check();
    if (!hasAnimated) {
      window.addEventListener('scroll', onScrollOrResize, { passive: true });
      window.addEventListener('resize', onScrollOrResize);
    }

    return () => {
      window.removeEventListener('scroll', onScrollOrResize);
      window.removeEventListener('resize', onScrollOrResize);
      if (rafId !== null) cancelAnimationFrame(rafId);
      cleanupAnimation?.();
    };
  }, [value, durationMs, prefersReducedMotion]);

  return (
    <span ref={ref} className={className}>
      {prefix}
      {display}
      {suffix}
    </span>
  );
}
