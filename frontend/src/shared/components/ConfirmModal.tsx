import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from './Button';
import { Modal } from './Modal';

export interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** `danger` para acciones destructivas (eliminar) -- cambia el color del botón de
   * confirmar, mismo criterio que `Button`. */
  variant?: 'primary' | 'danger';
}

/**
 * Confirmación genérica para acciones críticas (Épica 5, Módulo 5.3) -- reemplaza
 * `window.confirm` por un modal consistente con el resto de la interfaz, con estado de
 * carga propio mientras `onConfirm` resuelve. No usado retroactivamente en los módulos
 * anteriores (`ConsolaControlPanel` sigue con `window.confirm` para "Finalizar remate",
 * Épica 5.2, sin tocar) -- este componente es para las confirmaciones nuevas de este
 * módulo (eliminar remate/lote).
 */
export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  variant = 'primary',
}: ConfirmModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleConfirm() {
    setIsSubmitting(true);
    try {
      await onConfirm();
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>
            {cancelLabel}
          </Button>
          <Button
            variant={variant === 'danger' ? 'danger' : 'primary'}
            onClick={handleConfirm}
            isLoading={isSubmitting}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex items-start gap-3">
        {variant === 'danger' && (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-danger-50 text-danger-600">
            <AlertTriangle aria-hidden="true" className="h-5 w-5" />
          </span>
        )}
        <p className="pt-1.5 text-sm text-slate-600">{message}</p>
      </div>
    </Modal>
  );
}
