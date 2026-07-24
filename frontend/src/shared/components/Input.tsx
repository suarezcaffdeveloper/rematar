import { type InputHTMLAttributes, forwardRef } from 'react';
import clsx from 'clsx';
import { FIELD_CONTROL_CLASSES, FieldWrapper, useFieldIds } from './FieldWrapper';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

/**
 * Input con label y mensaje de error integrados -- evita repetir la misma estructura
 * (label + input + <p> de error, con los `htmlFor`/`aria-*` bien conectados) en cada
 * formulario nuevo.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, id, className, ...props },
  ref,
) {
  const { inputId, errorId } = useFieldIds(id);

  return (
    <FieldWrapper label={label} inputId={inputId} errorId={errorId} error={error}>
      <input
        ref={ref}
        id={inputId}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        className={clsx(FIELD_CONTROL_CLASSES, error ? 'border-danger-500' : 'border-slate-300', className)}
        {...props}
      />
    </FieldWrapper>
  );
});
