import { type ReactNode, useEffect, useRef, useState } from 'react';
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
 */
export function DropdownMenu({ items, trigger, triggerLabel = 'Más acciones' }: DropdownMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsOpen(false);
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        aria-label={triggerLabel}
        aria-haspopup="true"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
        className="rounded-md p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
      >
        {trigger ?? (
          <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
            <circle cx="10" cy="4" r="1.5" />
            <circle cx="10" cy="10" r="1.5" />
            <circle cx="10" cy="16" r="1.5" />
          </svg>
        )}
      </button>

      {isOpen && (
        <ul
          role="menu"
          className="absolute right-0 z-10 mt-1 w-48 rounded-md border border-slate-200 bg-white py-1 shadow-lg"
        >
          {items.map((item) => (
            <li key={item.label} role="none">
              <button
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  setIsOpen(false);
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
