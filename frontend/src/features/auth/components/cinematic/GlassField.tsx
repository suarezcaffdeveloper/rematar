import { type InputHTMLAttributes, type ReactNode, useId } from 'react';
import { Loader2, type LucideIcon } from 'lucide-react';

export interface GlassFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> {
  label: string;
  icon?: LucideIcon;
  /** Contenido a la derecha del campo (mostrar/ocultar contraseña, un tilde de validación). */
  rightElement?: ReactNode;
  error?: string;
}

/**
 * Campo para el panel de vidrio de login/registro (`CinematicShell`): etiqueta visible
 * arriba, 48 px de alto y anillo de foco claro. Mismo contrato que `shared/components/Input`
 * (`label`, `icon`, `rightElement`, `error`) pero con estilo para fondo oscuro -- el `Input`
 * común está pensado para fondo blanco y no sirve acá.
 */
export function GlassField({ label, icon: Icon, rightElement, error, id, ...props }: GlassFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = `${inputId}-error`;

  return (
    <div>
      <label htmlFor={inputId} className="mb-1.5 block text-[13px] font-medium text-white/80">
        {label}
      </label>
      <div className="relative">
        {Icon && (
          <Icon
            aria-hidden="true"
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/45"
          />
        )}
        <input
          id={inputId}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          className={`h-12 w-full rounded-xl border bg-white/[0.07] text-[15px] text-white outline-none transition placeholder:text-white/35 hover:border-white/30 focus:bg-white/10 focus:ring-4 ${
            Icon ? 'pl-10' : 'pl-3.5'
          } ${rightElement ? 'pr-11' : 'pr-3.5'} ${
            error
              ? 'border-danger-400 focus:border-danger-400 focus:ring-danger-400/25'
              : 'border-white/15 focus:border-brand-300 focus:ring-brand-400/25'
          }`}
          {...props}
        />
        {rightElement && <div className="absolute right-3.5 top-1/2 -translate-y-1/2">{rightElement}</div>}
      </div>
      {error && (
        <p id={errorId} className="mt-1.5 text-xs text-danger-300">
          {error}
        </p>
      )}
    </div>
  );
}

/** Botón de envío del panel de vidrio: blanco, con spinner y deshabilitado mientras `isLoading`. */
export function GlassSubmitButton({ isLoading, children }: { isLoading: boolean; children: ReactNode }) {
  return (
    <button
      type="submit"
      disabled={isLoading}
      className="group inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-white text-[15px] font-semibold text-ink transition hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/40 disabled:cursor-not-allowed disabled:opacity-70"
    >
      {isLoading ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : null}
      {children}
    </button>
  );
}

/** Mensaje inline sobre el panel de vidrio. `error` usa `role="alert"` (igual que `Alert`). */
export function GlassAlert({ variant, children }: { variant: 'error' | 'success'; children: ReactNode }) {
  return (
    <div
      role={variant === 'error' ? 'alert' : 'status'}
      className={`rounded-xl border px-4 py-3 text-sm ${
        variant === 'error'
          ? 'border-danger-400/40 bg-danger-500/20 text-danger-100'
          : 'border-success-400/40 bg-success-500/20 text-success-100'
      }`}
    >
      {children}
    </div>
  );
}
