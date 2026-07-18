import { type ReactNode, type SelectHTMLAttributes, forwardRef, useId } from 'react';
import clsx from 'clsx';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  error?: string;
  children: ReactNode;
}

/** Igual estructura que `Input`/`Textarea` (label + control + error integrados) para un
 * `<select>` -- categoría, moneda, etc. Las `<option>` las arma quien lo usa (este
 * componente no sabe de ningún dominio). */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, error, id, className, children, ...props },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = `${inputId}-error`;

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={inputId} className="text-sm font-medium text-slate-700">
        {label}
      </label>
      <select
        ref={ref}
        id={inputId}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        className={clsx(
          'rounded-md border bg-white px-3 py-2 text-sm shadow-sm',
          'focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500',
          error ? 'border-danger-500' : 'border-slate-300',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      {error && (
        <p id={errorId} className="text-sm text-danger-600">
          {error}
        </p>
      )}
    </div>
  );
});
