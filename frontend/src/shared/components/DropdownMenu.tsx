import { type ReactNode, useEffect, useRef, useState } from 'react';
import { MoreVertical } from 'lucide-react';
import clsx from 'clsx';

export interface DropdownMenuItem {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  variant?: 'default' | 'danger';
}

export interface DropdownMenuProps {
  items: DropdownMenuItem[];
  /** Contenido del botón que abre el menú -- por default, tres puntos verticales. */
  trigger?: ReactNode;
  triggerLabel?: string;
}

/**
 * Menú de acciones secundarias (Épica 5, Módulo 5.3) -- patrón "⋯" ya estándar en
 * herramientas modernas de gestión (Linear, Notion, GitHub) para no saturar una tarjeta
 * con un botón por acción. Cierra al elegir un ítem, al clickear afuera, o con Escape.
 * Sin ninguna librería nueva: un botón + una lista posicionada absolutamente.
 *
 * Navegación por teclado (Épica 9, Etapa 7 -- rediseño, accesibilidad final): al abrir,
 * el foco se mueve al primer ítem (patrón ARIA de menú, no se queda en el disparador);
 * ↑/↓/Home/End recorren los ítems habilitados; Escape cierra y devuelve el foco al
 * disparador -- antes solo cerraba, sin devolver el foco a ningún lado.
 */
export function DropdownMenu({ items, trigger, triggerLabel = 'Más acciones' }: DropdownMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const triggerButtonRef = useRef<HTMLButtonElement>(null);

  function close(restoreFocus: boolean) {
    setIsOpen(false);
    if (restoreFocus) triggerButtonRef.current?.focus();
  }

  useEffect(() => {
    if (!isOpen) return;

    function menuItems(): HTMLElement[] {
      return Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)') ?? []);
    }

    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        close(true);
        return;
      }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const list = menuItems();
      if (list.length === 0) return;
      const currentIndex = list.indexOf(document.activeElement as HTMLElement);
      const nextIndex =
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? list.length - 1
            : event.key === 'ArrowDown'
              ? (currentIndex + 1) % list.length
              : (currentIndex - 1 + list.length) % list.length;
      list[nextIndex]?.focus();
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    menuItems()[0]?.focus();

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        ref={triggerButtonRef}
        type="button"
        aria-label={triggerLabel}
        aria-haspopup="true"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
        className="rounded-md p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
      >
        {trigger ?? <MoreVertical aria-hidden="true" className="h-5 w-5" />}
      </button>

      {isOpen && (
        <ul
          ref={menuRef}
          role="menu"
          className="absolute right-0 z-10 mt-1 w-48 rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
        >
          {items.map((item) => (
            <li key={item.label} role="none">
              <button
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  close(true);
                  item.onSelect();
                }}
                className={clsx(
                  'block w-full px-4 py-2 text-left text-sm transition-colors',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                  item.variant === 'danger'
                    ? 'text-danger-600 hover:bg-danger-50'
                    : 'text-slate-700 hover:bg-slate-100',
                )}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
