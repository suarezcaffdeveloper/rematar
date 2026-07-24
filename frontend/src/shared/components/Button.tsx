import { type ButtonHTMLAttributes, forwardRef } from 'react';
import clsx from 'clsx';
import { Spinner } from './Spinner';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  isLoading?: boolean;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-brand-600 text-white shadow-sm hover:bg-brand-700 active:bg-brand-800 focus-visible:ring-brand-500',
  secondary:
    'bg-white text-slate-700 border border-slate-300 shadow-sm hover:bg-slate-50 active:bg-slate-100 focus-visible:ring-brand-500',
  danger:
    'bg-danger-600 text-white shadow-sm hover:bg-danger-700 active:bg-danger-800 focus-visible:ring-danger-500',
  ghost: 'bg-transparent text-slate-600 hover:bg-slate-100 active:bg-slate-200 focus-visible:ring-brand-500',
};

/**
 * Botón base -- todo el resto de la app debería usar este componente en vez de un
 * `<button>` crudo, para que el estilo y el estado de carga sean consistentes en
 * cualquier pantalla futura. Foco por `ring` (no `outline`), mismo patrón que el resto
 * de los controles interactivos del sistema de diseño (Input/Select/Textarea/
 * DropdownMenu) -- unificado en el rediseño (Épica 9, Etapa 1).
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', isLoading = false, disabled, className, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || isLoading}
      aria-busy={isLoading}
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium',
        'transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none',
        VARIANT_CLASSES[variant],
        className,
      )}
      {...props}
    >
      {isLoading && <Spinner size="sm" />}
      {children}
    </button>
  );
});
