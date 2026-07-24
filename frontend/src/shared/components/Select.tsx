import { type ReactNode, type SelectHTMLAttributes, forwardRef } from 'react';
import clsx from 'clsx';
import { FIELD_CONTROL_CLASSES, FieldWrapper, useFieldIds } from './FieldWrapper';

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
  const { inputId, errorId } = useFieldIds(id);

  return (
    <FieldWrapper label={label} inputId={inputId} errorId={errorId} error={error}>
      <select
        ref={ref}
        id={inputId}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        className={clsx(FIELD_CONTROL_CLASSES, error ? 'border-danger-500' : 'border-slate-300', className)}
        {...props}
      >
        {children}
      </select>
    </FieldWrapper>
  );
});
