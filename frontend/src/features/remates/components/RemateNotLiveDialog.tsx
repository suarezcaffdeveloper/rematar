import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Clock } from 'lucide-react';
import { Button } from '../../../shared/components/Button';
import { useFocusTrap } from '../../../shared/hooks/useFocusTrap';
import { formatDateTime } from '../../../shared/lib/format';

export interface RemateNotLiveDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** `null` para un remate sin fecha de inicio todavía (ej. un borrador que un
   * dueño/admin previsualiza antes de publicarlo) -- el mensaje cae a una variante
   * genérica en vez de mostrar una fecha inexistente. */
  startsAt: string | null;
}

const OVERLAY_TRANSITION = { duration: 0.2, ease: [0.21, 0.47, 0.32, 0.98] as const };

/**
 * Cartel que se muestra al tocar "Entrar al remate" en el Detalle del Remate mientras
 * todavía no está en vivo (`draft`/`scheduled`) -- sin esto, un visitante que entra
 * antes de hora se encuentra la Sala completamente vacía ("no hay ningún lote abierto"),
 * sin ninguna pista de que el remate ni siquiera empezó. No navega a ningún lado: solo
 * informa y, al tocar "Continuar", se cierra y el visitante se queda en el Detalle,
 * mismo criterio que pedía la revisión de producto.
 *
 * Mismo mecanismo de overlay animado que `LogoutConfirmDialog` (fade + scale vía
 * `AnimatePresence`, foco atrapado, Escape, bloqueo de scroll) para que se sienta como
 * "el mismo cartel" que el resto de la app -- acá con un solo botón (no hay nada que
 * confirmar/cancelar, es puramente informativo) y el ícono/color en tono "info"
 * (`brand`) en vez del tono "danger" que usa el de cerrar sesión.
 */
export function RemateNotLiveDialog({ isOpen, onClose, startsAt }: RemateNotLiveDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useReducedMotion();
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
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={OVERLAY_TRANSITION}
            className="absolute inset-0 bg-slate-900/50"
          />
          <motion.div
            ref={dialogRef}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="remate-not-live-title"
            aria-describedby="remate-not-live-message"
            tabIndex={-1}
            initial={prefersReducedMotion ? undefined : { opacity: 0, scale: 0.94, y: 12 }}
            animate={prefersReducedMotion ? undefined : { opacity: 1, scale: 1, y: 0 }}
            exit={prefersReducedMotion ? undefined : { opacity: 0, scale: 0.94, y: 12 }}
            transition={OVERLAY_TRANSITION}
            className="relative flex w-full max-w-sm flex-col gap-4 rounded-2xl bg-white p-6 shadow-xl focus:outline-none"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                <Clock aria-hidden="true" className="h-5 w-5" />
              </span>
              <h2 id="remate-not-live-title" className="text-base font-semibold text-slate-900">
                Todavía no empezó
              </h2>
            </div>
            <p id="remate-not-live-message" className="text-sm text-slate-600">
              {startsAt
                ? `Este remate todavía no está en vivo. Arranca el ${formatDateTime(startsAt)}`
                : 'Este remate todavía no está en vivo -- todavía no se definió su fecha de inicio.'}
            </p>
            <div className="flex justify-end pt-1">
              <Button onClick={onClose}>Continuar</Button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
