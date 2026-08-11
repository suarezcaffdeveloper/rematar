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
  /** Ancho máximo -- `md` (formularios simples, confirmaciones), `lg` (formularios con
   * más campos, como el de lote) o `xl` (formularios con panel lateral, como el
   * asistente de creación de remate). */
  size?: 'md' | 'lg' | 'xl';
  /** Oculta la barra de título por defecto (título + botón cerrar) para que el propio
   * contenido arme su encabezado (rediseño del formulario de remate, item 1/8) -- el
   * `title` pasa a usarse como `aria-label` del diálogo en vez de `aria-labelledby` (no
   * se duplica como `<h2>` oculto: el propio encabezado del contenido, con el mismo
   * texto, ya es un heading real). El botón de cerrar se mantiene, flotante sobre el
   * contenido. `false` por defecto: ningún modal existente cambia de comportamiento. */
  hideHeader?: boolean;
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
export function Modal({ isOpen, onClose, title, children, footer, size = 'md', hideHeader = false }: ModalProps) {
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
        aria-labelledby={hideHeader ? undefined : titleId}
        aria-label={hideHeader ? title : undefined}
        tabIndex={-1}
        className={clsx(
          'relative flex max-h-[90vh] w-full flex-col rounded-2xl bg-white shadow-xl focus:outline-none',
          size === 'xl' ? 'max-w-4xl' : size === 'lg' ? 'max-w-2xl' : 'max-w-md',
        )}
      >
        {hideHeader ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-slate-400 shadow-sm ring-1 ring-slate-200 backdrop-blur transition-colors hover:bg-slate-100 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        ) : (
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
        )}

        <div className="flex-1 overflow-y-auto px-6 py-4">{children}</div>

        {footer && <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
