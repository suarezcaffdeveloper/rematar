import { type ReactNode, useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';

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
 * abrir. No hace trap de foco completo (ciclar Tab dentro del modal) -- alcanza para los
 * formularios cortos de este módulo (un puñado de campos), y agregarlo sería
 * complejidad sin un caso de uso real todavía.
 *
 * `createPortal` al `document.body`: evita que el modal quede recortado por un ancestro
 * con `overflow: hidden` (por ejemplo, una tarjeta con `overflow-hidden`) y asegura que
 * su `z-index` gane sobre cualquier contenido de la página.
 */
export function Modal({ isOpen, onClose, title, children, footer, size = 'md' }: ModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

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
          'relative flex max-h-[90vh] w-full flex-col rounded-xl bg-white shadow-xl focus:outline-none',
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
            className="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          >
            <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-5 w-5">
              <path
                d="m5 5 10 10M15 5 5 15"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">{children}</div>

        {footer && <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
