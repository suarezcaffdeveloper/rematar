import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { LogOut } from 'lucide-react';
import { Button } from '../../shared/components/Button';
import { useFocusTrap } from '../../shared/hooks/useFocusTrap';

export interface LogoutConfirmDialogProps {
  isOpen: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

const OVERLAY_TRANSITION = { duration: 0.2, ease: [0.21, 0.47, 0.32, 0.98] as const };

/**
 * Confirmación antes de cerrar sesión -- mismo mecanismo de overlay animado (fade +
 * scale, `AnimatePresence`) que `LoteCard`'s `LoteDetailOverlay`: un `<button>` de
 * "Cerrar sesión" ya no dispara `logout()` directo, primero abre este diálogo y solo
 * un segundo click en su propio botón "Cerrar sesión" confirma. Componente propio (no
 * el `Modal` compartido) para no afectar ningún otro flujo que ya use `Modal` sin
 * animación, mismo criterio que `LoteDetailOverlay`.
 */
export function LogoutConfirmDialog({ isOpen, onCancel, onConfirm }: LogoutConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useReducedMotion();
  const titleId = useId();
  const messageId = useId();
  useFocusTrap(dialogRef, isOpen);

  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onCancel();
    }
    document.addEventListener('keydown', handleKeyDown);
    dialogRef.current?.focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, onCancel]);

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            aria-hidden="true"
            onClick={onCancel}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={OVERLAY_TRANSITION}
            className="absolute inset-0 bg-slate-900/50"
          />
          <motion.div
            ref={dialogRef}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={messageId}
            tabIndex={-1}
            initial={prefersReducedMotion ? undefined : { opacity: 0, scale: 0.94, y: 12 }}
            animate={prefersReducedMotion ? undefined : { opacity: 1, scale: 1, y: 0 }}
            exit={prefersReducedMotion ? undefined : { opacity: 0, scale: 0.94, y: 12 }}
            transition={OVERLAY_TRANSITION}
            className="relative flex w-full max-w-sm flex-col gap-4 rounded-2xl bg-white p-6 shadow-xl focus:outline-none"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-danger-50 text-danger-600">
                <LogOut aria-hidden="true" className="h-5 w-5" />
              </span>
              <h2 id={titleId} className="text-base font-semibold text-slate-900">
                Cerrar sesión
              </h2>
            </div>
            <p id={messageId} className="text-sm text-slate-600">
              ¿Seguro que querés cerrar tu sesión?
            </p>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={onCancel}>
                Cancelar
              </Button>
              <Button variant="danger" onClick={onConfirm}>
                Cerrar sesión
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
