/** Alto aproximado de `LandingNavbar` (fijo, `position:fixed`) -- sin este offset el
 * scroll dejaría el título de la sección tapado detrás de la barra. */
const NAVBAR_OFFSET_PX = 80;

/** Ease-out cuadrática -- mismo tipo de curva que ya usa `AnimatedCounter` para su
 * conteo (arranca rápido, frena suave), no una lineal. */
function easeOutQuad(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

/**
 * Scroll suave hasta el elemento con este id (pedido explícito de los links de menú de
 * la landing, `LandingNavbar`/`LandingFooter`, ambos comparten `NAV_LINKS`): a
 * diferencia de `scroll-behavior: smooth` del navegador -- cuya duración crece con la
 * distancia y puede sentirse lento saltando a una sección lejana -- la duración acá
 * queda acotada (350-600ms) sin importar qué tan lejos esté el destino, así el
 * movimiento se ve siempre suave pero nunca "tarda" en llegar. Respeta
 * `prefers-reduced-motion`: salta directo, sin animar.
 */
export function smoothScrollToHash(hash: string): void {
  const id = hash.replace(/^#/, '');
  const el = document.getElementById(id);
  if (!el) return;

  const targetY = el.getBoundingClientRect().top + window.scrollY - NAVBAR_OFFSET_PX;
  const startY = window.scrollY;
  const distance = targetY - startY;

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReducedMotion || distance === 0) {
    window.scrollTo(0, targetY);
    return;
  }

  const duration = Math.min(600, Math.max(350, Math.abs(distance) * 0.12));
  const start = performance.now();

  function tick(now: number) {
    const progress = Math.min(1, (now - start) / duration);
    window.scrollTo(0, startY + distance * easeOutQuad(progress));
    if (progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}
