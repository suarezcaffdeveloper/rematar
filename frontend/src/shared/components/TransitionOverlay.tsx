import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { motion, useReducedMotion } from 'framer-motion';

export interface TransitionOverlayProps {
  isOpen: boolean;
  onDone: () => void;
  icon: ReactNode;
  title: string;
  description: string;
  /** Cuánto se muestra antes de autodescartarse y llamar a `onDone` -- 1000ms default. */
  displayMs?: number;
}

const DEFAULT_DISPLAY_MS = 1000;

/**
 * Cartel de transición breve tras completar una acción, antes de redirigir a otra
 * pantalla (extraído de `RemateCreatedOverlay` al aparecer un segundo caso de uso --
 * "iniciar remate" -- con el mismo patrón visual). No se puede cerrar a mano: se
 * autodescarta a los `displayMs` llamando a `onDone`, quien decide qué hacer después
 * (normalmente navegar). Reemplaza una navegación muda por una confirmación explícita de
 * que algo pasó y hacia dónde va el usuario.
 */
export function TransitionOverlay({
  isOpen,
  onDone,
  icon,
  title,
  description,
  displayMs = DEFAULT_DISPLAY_MS,
}: TransitionOverlayProps) {
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(onDone, displayMs);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, displayMs]);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
      <motion.div
        role="status"
        aria-live="polite"
        initial={prefersReducedMotion ? undefined : { opacity: 0, scale: 0.95, y: 8 }}
        animate={prefersReducedMotion ? undefined : { opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.21, 0.47, 0.32, 0.98] }}
        className="flex w-full max-w-sm flex-col items-center gap-4 rounded-2xl bg-white p-8 text-center shadow-xl"
      >
        <motion.div
          initial={prefersReducedMotion ? undefined : { scale: 0.5, opacity: 0 }}
          animate={prefersReducedMotion ? undefined : { scale: 1, opacity: 1 }}
          transition={{ duration: 0.35, ease: [0.21, 0.47, 0.32, 0.98], delay: 0.05 }}
          className="flex h-16 w-16 items-center justify-center rounded-full bg-success-50 text-success-600"
        >
          {icon}
        </motion.div>

        <div>
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        </div>

        <div className="h-1 w-full overflow-hidden rounded-full bg-slate-100">
          <motion.div
            initial={{ x: '-100%' }}
            animate={{ x: '100%' }}
            transition={{ duration: 1, ease: 'linear', repeat: Infinity }}
            className="h-full w-2/3 rounded-full bg-gradient-to-r from-brand-500 to-brand-700"
          />
        </div>
      </motion.div>
    </div>,
    document.body,
  );
}
