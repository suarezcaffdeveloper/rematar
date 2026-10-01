import { type ReactNode, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { X } from 'lucide-react';
import { useFocusTrap } from '../../../shared/hooks/useFocusTrap';

export interface GarantiaDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** Nombre accesible del diálogo (el encabezado visible lo arma el propio contenido). */
  title: string;
  children: ReactNode;
  /** Salida más lenta y con más recorrido: la usa el cierre tras una garantía autorizada,
   * para acompañar a la billetera que se va hacia abajo dentro de la card. */
  slowExit?: boolean;
}

// Entrada más lenta y "decidida" que la salida: abrir es el momento que se tiene que
// notar; cerrar tiene que sentirse liviano, sin hacer esperar.
const ENTER_EASE = [0.22, 1, 0.36, 1] as const;
const EXIT_EASE = [0.4, 0, 0.2, 1] as const;

/**
 * Card grande flotante del flujo de garantía. Componente propio (no el `Modal`
 * compartido) por el mismo criterio que `LogoutConfirmDialog`: necesita animación de
 * salida (`AnimatePresence`), que `Modal` -- sin animación, usado por muchos otros
 * flujos -- no tiene. Entra con fade + leve subida + escala mientras el fondo se
 * desenfoca, y sale con el movimiento inverso, más corto.
 */
export function GarantiaDialog({ isOpen, onClose, title, children, slowExit = false }: GarantiaDialogProps) {
  const exitSeconds = slowExit ? 0.8 : 0.38;
  const dialogRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  useFocusTrap(dialogRef, isOpen);

  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    dialogRef.current?.focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, onClose]);

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            aria-hidden="true"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: 0.45, ease: 'easeOut' } }}
            exit={{ opacity: 0, transition: { duration: exitSeconds, ease: 'easeIn' } }}
            className="absolute inset-0 bg-slate-900/45 backdrop-blur-[3px]"
          />
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            tabIndex={-1}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 32, scale: 0.96 }}
            animate={
              reduceMotion
                ? { opacity: 1 }
                : { opacity: 1, y: 0, scale: 1, transition: { duration: 0.6, ease: ENTER_EASE } }
            }
            exit={
              reduceMotion
                ? { opacity: 0 }
                : { opacity: 0, y: slowExit ? 40 : 20, scale: 0.98, transition: { duration: exitSeconds, ease: EXIT_EASE } }
            }
            className="relative flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl focus:outline-none"
          >
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-slate-400 shadow-sm ring-1 ring-slate-200 backdrop-blur transition-colors hover:bg-slate-100 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </button>
            <div className="flex-1 overflow-y-auto">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
