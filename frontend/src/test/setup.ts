import { vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

/**
 * jsdom no implementa `IntersectionObserver` -- lo necesitan los componentes con
 * animaciones "al hacer scroll" de Framer Motion (`whileInView`/`useInView`, ver
 * `features/landing/components/Reveal.tsx` y `AnimatedCounter.tsx`). Sin este stub,
 * cualquier test que monte esos componentes explota con
 * "ReferenceError: IntersectionObserver is not defined" antes de llegar a los
 * asserts. No hace falta que observe nada de verdad: los tests de esta app no
 * verifican animaciones, sólo que el contenido esté presente.
 */
class IntersectionObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

vi.stubGlobal('IntersectionObserver', IntersectionObserverStub);

/**
 * jsdom tampoco implementa `ResizeObserver` -- lo usan los carruseles que miden el alto
 * real de una card para posicionar el resto por `transform` (ver
 * `features/remates/components/LiveRemateCarousel.tsx`) y las descripciones que miden si
 * se recortan (`ExpandableDescription`). Mismo criterio que el stub de
 * `IntersectionObserver` de arriba: no hace falta que dispare el callback de verdad, los
 * tests de esta app no verifican medidas en píxeles, sólo que el contenido esté
 * presente.
 */
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal('ResizeObserver', ResizeObserverStub);
