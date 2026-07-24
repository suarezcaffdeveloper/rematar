import type { ReactNode } from 'react';
import clsx from 'clsx';

type BadgeVariant = 'brand' | 'success' | 'danger' | 'warning' | 'neutral';

export interface BadgeProps {
  variant?: BadgeVariant;
  children: ReactNode;
  className?: string;
}

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  brand: 'bg-brand-50 text-brand-700',
  success: 'bg-success-50 text-success-700',
  danger: 'bg-danger-50 text-danger-700',
  // Token `warning` real desde el rediseño (Épica 9, Etapa 1) -- antes se simulaba con
  // `amber` crudo de Tailwind porque no existía en el theme (`styles/index.css`).
  warning: 'bg-warning-50 text-warning-700',
  neutral: 'bg-slate-100 text-slate-600',
};

/** Etiqueta chica de una palabra -- estado de un remate, categoría, etc. */
export function Badge({ variant = 'neutral', children, className }: BadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium',
        VARIANT_CLASSES[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
