import { type TextareaHTMLAttributes, forwardRef, useId } from 'react';
import clsx from 'clsx';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  error?: string;
}

/** Igual estructura que `Input` (label + control + error integrados) para un campo
 * multilínea -- descripción de un remate/lote, motivo de cancelación, etc. */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, error, id, className, rows = 4, ...props },
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
      <textarea
        ref={ref}
        id={inputId}
        rows={rows}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        className={clsx(
          'rounded-md border px-3 py-2 text-sm shadow-sm',
          'focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500',
          error ? 'border-danger-500' : 'border-slate-300',
          className,
        )}
        {...props}
      />
      {error && (
        <p id={errorId} className="text-sm text-danger-600">
          {error}
        </p>
      )}
    </div>
  );
});
