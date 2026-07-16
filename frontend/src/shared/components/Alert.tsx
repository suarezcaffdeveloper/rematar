import type { ReactNode } from 'react';
import clsx from 'clsx';

type AlertVariant = 'error' | 'success' | 'info';

const VARIANT_CLASSES: Record<AlertVariant, string> = {
  error: 'bg-danger-50 text-danger-700 border-danger-200',
  success: 'bg-success-50 text-success-600 border-green-200',
  info: 'bg-brand-50 text-brand-700 border-brand-100',
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
