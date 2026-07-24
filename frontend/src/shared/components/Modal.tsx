import { type ReactNode, useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import clsx from 'clsx';
import { useFocusTrap } from '../hooks/useFocusTrap';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  /** Ancho máximo -- `md` (formularios simples, confirmaciones) o `lg` (formularios con
   * más campos, como el de lote). */
  size?: 'md' | 'lg';
}

/**
 * Modal genérico (Épica 5, Módulo 5.3 -- primer uso real en el proyecto; ningún módulo
 * anterior lo había necesitado). Sin ninguna librería nueva: overlay + `<dialog>`-like
 * div posicionado, cierre por Escape/click en el fondo, foco inicial en el modal al
 * abrir. Trap de foco completo (ciclar Tab dentro del modal, restaurar el foco al
 * disparador al cerrar) vía `useFocusTrap` (Épica 9, Etapa 7 -- rediseño, accesibilidad
 * final) -- antes no lo tenía, aceptado como límite conocido mientras los formularios
 * eran cortos; se cierra en la etapa dedicada a accesibilidad.
 *
 * `createPortal` al `document.body`: evita que el modal quede recortado por un ancestro
 * con `overflow: hidden` (por ejemplo, una tarjeta con `overflow-hidden`) y asegura que
 * su `z-index` gane sobre cualquier contenido de la página.
 */
export function Modal({ isOpen, onClose, title, children, footer, size = 'md' }: ModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  useFocusTrap(dialogRef, isOpen);

  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    dialogRef.current?.focus();

    // Bloquea el scroll del fondo mientras el modal está abierto -- restaurado al cerrar.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div aria-hidden="true" className="absolute inset-0 bg-slate-900/50" onClick={onClose} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={clsx(
          'relative flex max-h-[90vh] w-full flex-col rounded-2xl bg-white shadow-xl focus:outline-none',
          size === 'lg' ? 'max-w-2xl' : 'max-w-md',
        )}
      >
        <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-6 py-4">
          <h2 id={titleId} className="text-lg font-semibold text-slate-900">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">{children}</div>

        {footer && <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
