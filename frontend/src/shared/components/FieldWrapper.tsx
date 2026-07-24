import { type ReactNode, useId } from 'react';

/**
 * Boilerplate compartido de `Input`/`Select`/`Textarea` (Épica 9, Etapa 1 -- rediseño):
 * las tres triplicaban el mismo wrapper "label + control + mensaje de error" con
 * `useId` propio. Extraído acá sin cambiar ningún prop público de esos tres componentes.
 */
export function useFieldIds(id?: string): { inputId: string; errorId: string } {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  return { inputId, errorId: `${inputId}-error` };
}

/** Clases del control en sí (input/select/textarea) -- unificadas para que el foco y
 * los estados de error/disabled se vean idénticos en los tres. */
export const FIELD_CONTROL_CLASSES =
  'w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ' +
  'transition-colors placeholder:text-slate-400 ' +
  'focus:outline-none focus:ring-2 focus:ring-brand-500 ' +
  'disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500';

export interface FieldWrapperProps {
  label: string;
  inputId: string;
  errorId: string;
  error?: string;
  children: ReactNode;
}

export function FieldWrapper({ label, inputId, errorId, error, children }: FieldWrapperProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-medium text-slate-700">
        {label}
      </label>
      {children}
      {error && (
        <p id={errorId} className="text-sm text-danger-600">
          {error}
        </p>
      )}
    </div>
  );
}
