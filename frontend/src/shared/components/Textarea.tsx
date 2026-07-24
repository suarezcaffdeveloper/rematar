import { type TextareaHTMLAttributes, forwardRef } from 'react';
import clsx from 'clsx';
import { FIELD_CONTROL_CLASSES, FieldWrapper, useFieldIds } from './FieldWrapper';

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
  const { inputId, errorId } = useFieldIds(id);

  return (
    <FieldWrapper label={label} inputId={inputId} errorId={errorId} error={error}>
      <textarea
        ref={ref}
        id={inputId}
        rows={rows}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        className={clsx(FIELD_CONTROL_CLASSES, error ? 'border-danger-500' : 'border-slate-300', className)}
        {...props}
      />
    </FieldWrapper>
  );
});
