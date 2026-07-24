import type { ReactNode } from 'react';
import clsx from 'clsx';

type AlertVariant = 'error' | 'success' | 'info' | 'warning';

const VARIANT_CLASSES: Record<AlertVariant, string> = {
  error: 'bg-danger-50 text-danger-700 border-danger-200',
  success: 'bg-success-50 text-success-700 border-success-200',
  info: 'bg-brand-50 text-brand-700 border-brand-200',
  // Nueva desde el rediseño (Épica 9, Etapa 1) -- antes solo existían error/success/info.
  warning: 'bg-warning-50 text-warning-700 border-warning-200',
};

export interface AlertProps {
  variant?: AlertVariant;
  children: ReactNode;
  className?: string;
}

/** Mensaje inline (dentro de un formulario, por ejemplo) -- para avisos flotantes
 * globales ver `shared/toast/`. */
export function Alert({ variant = 'info', children, className }: AlertProps) {
  return (
    <div
      role={variant === 'error' ? 'alert' : 'status'}
      className={clsx('rounded-md border px-4 py-3 text-sm', VARIANT_CLASSES[variant], className)}
    >
      {children}
    </div>
  );
}
