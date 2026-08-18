import { type ButtonHTMLAttributes, forwardRef } from 'react';
import clsx from 'clsx';
import { Spinner } from './Spinner';

type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'danger'
  | 'ghost'
  | 'inverse'
  | 'success-soft'
  | 'warning-soft'
  | 'brand-soft'
  | 'hero'
  | 'chip'
  | 'success-outline'
  | 'warning-outline'
  | 'danger-outline'
  | 'ink-outline'
  | 'brand-outline';

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
  /** Botón claro sobre fondo de color intenso (ej. la card "azul fuerte" del panel de
   * control operativo de la Consola) -- mismo lenguaje que `secondary` pero sin borde,
   * pensado para contrastar con un fondo ya saturado en vez del fondo blanco de la app. */
  inverse: 'bg-white text-brand-700 shadow-sm hover:bg-brand-50 active:bg-brand-100 focus-visible:ring-white',
  /** Variantes "soft" (fondo pastel + texto en el mismo tono, sin borde): usadas para
   * acciones agrupadas donde el color comunica la naturaleza de la acción (positiva/
   * neutra/preventiva) sin la fuerza visual de `primary`/`danger`. */
  'success-soft':
    'bg-success-100 text-success-800 hover:bg-success-200 active:bg-success-300 focus-visible:ring-success-500',
  'warning-soft':
    'bg-warning-100 text-warning-800 hover:bg-warning-200 active:bg-warning-300 focus-visible:ring-warning-500',
  'brand-soft': 'bg-brand-50 text-brand-700 hover:bg-brand-100 active:bg-brand-200 focus-visible:ring-brand-500',
  /** CTA principal del rediseño visual (Sala del Remate -- ver prototipo aprobado):
   * fondo casi negro (`ink`) que pasa a azul de marca en hover -- tratamiento propio
   * para la acción más importante de una pantalla (ej. "Ofertar"), distinto del `primary`
   * azul liso que se usa para el resto de las acciones principales de la app. */
  hero: 'bg-ink text-white shadow-sm hover:bg-brand-600 active:bg-brand-700 focus-visible:ring-brand-500',
  /** Sugerencia seleccionable de bajo compromiso (ej. montos rápidos de oferta): sin
   * fondo hasta el hover, a diferencia de `secondary` (que siempre tiene fondo blanco +
   * borde) -- mismo lenguaje que el resto del rediseño visual (ver prototipo aprobado). */
  chip: 'bg-transparent text-ink-muted border border-line hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 focus-visible:ring-brand-500',
  /** Variantes "outline" (fondo blanco + borde + texto/ícono en un tono, Consola
   * Operativa -- ver prototipo aprobado "Panel de control operativo"): a diferencia de
   * `*-soft` (fondo pastel liso), acá el fondo queda blanco y el color vive solo en el
   * borde/texto -- pensado para una botonera densa (2 por fila) donde un fondo de color
   * en cada botón se sentía demasiado cargado. `success`/`warning`/`danger` llevan el
   * borde ya teñido incluso sin hover (la acción se lee de un vistazo); `ink` es el
   * tratamiento neutro para acciones sin una connotación de color propia (ej. "Cerrar
   * lote", "Reanudar remate") -- mismo rol que cumplía `brand-soft` antes acá, pero sin
   * teñir de azul una acción que no es necesariamente "positiva". */
  'success-outline':
    'bg-white text-success-700 border border-success-200 hover:bg-success-50 hover:border-success-300 focus-visible:ring-success-500',
  'warning-outline':
    'bg-white text-warning-700 border border-warning-300 hover:bg-warning-50 focus-visible:ring-warning-500',
  'danger-outline':
    'bg-white text-danger-700 border border-danger-200 hover:bg-danger-50 hover:border-danger-300 focus-visible:ring-danger-500',
  'ink-outline':
    'bg-white text-ink border border-line-strong hover:bg-surface-subtle focus-visible:ring-brand-500',
  /** Igual que las demás `*-outline`, pero teñida de marca -- para la acción "outline"
   * más importante de un grupo (ej. "Pasar al siguiente lote" en el panel de control de
   * la Consola), donde `ink-outline` la dejaría sin ninguna jerarquía frente al resto. */
  'brand-outline':
    'bg-white text-brand-700 border border-brand-200 hover:bg-brand-50 hover:border-brand-300 focus-visible:ring-brand-500',
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
