import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Atrapa el foco por Tab/Shift+Tab dentro de `containerRef` mientras `isActive` es
 * `true`, y restaura el foco al elemento que lo tenía antes de activarse (el disparador
 * que abrió el overlay) cuando se desactiva -- mismo comportamiento para cualquier
 * overlay modal (`Modal`, drawer mobile de `Sidebar`, Épica 9 Etapa 7 -- rediseño,
 * accesibilidad final). Escape lo maneja cada consumidor por separado (algunos ya
 * escuchan otras teclas en el mismo listener).
 */
export function useFocusTrap(containerRef: RefObject<HTMLElement | null>, isActive: boolean) {
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isActive) return;

    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Tab') return;
      const container = containerRef.current;
      if (!container) return;

      const focusable = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previouslyFocusedRef.current?.focus();
    };
  }, [isActive, containerRef]);
}
