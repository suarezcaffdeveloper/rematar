import { type InputHTMLAttributes, type ReactNode, forwardRef } from 'react';
import clsx from 'clsx';
import type { LucideIcon } from 'lucide-react';
import { FIELD_CONTROL_CLASSES, FieldWrapper, useFieldIds } from './FieldWrapper';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  /** Ícono decorativo a la izquierda del campo (ej. `Mail`, `Lock`). Opcional --
   * sin esto el input se ve exactamente igual que antes. */
  icon?: LucideIcon;
  /** Contenido interactivo a la derecha del campo (ej. mostrar/ocultar contraseña,
   * un ícono de validación). Opcional, mismo criterio que `icon`. */
  rightElement?: ReactNode;
}

/**
 * Input con label y mensaje de error integrados -- evita repetir la misma estructura
 * (label + input + <p> de error, con los `htmlFor`/`aria-*` bien conectados) en cada
 * formulario nuevo. `icon`/`rightElement` son opt-in (rediseño del registro, ver
 * `features/auth/pages/RegisterPage.tsx`) -- el padding que dejan lugar para ellos se
 * aplica por `style` en vez de una clase Tailwind (`pl-10`/`pr-10`) a propósito: así
 * siempre gana por sobre el `px-3` de `FIELD_CONTROL_CLASSES` sin depender del orden
 * en que Tailwind genere esas dos utilidades en la hoja de estilos.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, id, className, icon: Icon, rightElement, style, ...props },
  ref,
) {
  const { inputId, errorId } = useFieldIds(id);

  return (
    <FieldWrapper label={label} inputId={inputId} errorId={errorId} error={error}>
      <div className="relative">
        {Icon && (
          <Icon
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          />
        )}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          style={{
            paddingLeft: Icon ? '2.5rem' : undefined,
            paddingRight: rightElement ? '2.5rem' : undefined,
            ...style,
          }}
          className={clsx(FIELD_CONTROL_CLASSES, error ? 'border-danger-500' : 'border-slate-300', className)}
          {...props}
        />
        {rightElement && <div className="absolute right-3 top-1/2 -translate-y-1/2">{rightElement}</div>}
      </div>
    </FieldWrapper>
  );
});
