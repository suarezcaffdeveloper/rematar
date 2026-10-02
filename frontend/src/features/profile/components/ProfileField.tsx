import { type InputHTMLAttributes, type ReactNode, forwardRef } from 'react';
import clsx from 'clsx';
import { useFieldIds } from '../../../shared/components/FieldWrapper';

export interface ProfileFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  /** Texto de ayuda bajo el campo (se oculta mientras haya un error). */
  help?: string;
  /** Contenido interactivo a la derecha del campo (ej. mostrar/ocultar contraseña). */
  rightElement?: ReactNode;
}

/**
 * Campo de formulario con el estilo editorial de "Mi perfil": etiqueta arriba y solo una línea
 * inferior (la misma de la búsqueda del Historial), sin caja. Se usa en los dos modales de la
 * pantalla; mantiene `label`/`aria-invalid`/`aria-describedby` conectados como `Input`.
 */
export const ProfileField = forwardRef<HTMLInputElement, ProfileFieldProps>(function ProfileField(
  { label, error, help, rightElement, id, className, ...props },
  ref,
) {
  const { inputId, errorId } = useFieldIds(id);
  const helpId = `${inputId}-help`;

  return (
    <div>
      <label htmlFor={inputId} className="block text-sm font-semibold text-ink">
        {label}
      </label>
      <div className="relative">
        <input
          ref={ref}
          id={inputId}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : help ? helpId : undefined}
          className={clsx(
            'w-full rounded-none border-0 border-b-[1.5px] bg-transparent py-2.5 pl-0 text-[17px] text-ink transition-colors',
            'placeholder:text-ink-faint hover:border-ink-muted focus:border-brand-600 focus:outline-none',
            rightElement ? 'pr-10' : 'pr-0',
            error ? 'border-danger-600' : 'border-line-strong',
            className,
          )}
          {...props}
        />
        {rightElement && <div className="absolute right-0 top-1/2 -translate-y-1/2">{rightElement}</div>}
      </div>
      {error ? (
        <p id={errorId} className="mt-1.5 text-[13px] text-danger-600">
          {error}
        </p>
      ) : (
        help && (
          <p id={helpId} className="mt-1.5 text-[13px] text-ink-muted">
            {help}
          </p>
        )
      )}
    </div>
  );
});
