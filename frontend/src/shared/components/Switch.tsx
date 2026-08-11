import type { ReactNode } from 'react';
import clsx from 'clsx';

export interface SwitchProps {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}

/**
 * Switch on/off con label y descripción opcional (rediseño del formulario de remate,
 * item 6) -- reemplaza los `<input type="checkbox">` sueltos que se veían "técnicos"
 * para opciones de configuración (anti-sniping, timer por lote). Label y descripción
 * van en elementos separados (no ambos dentro del mismo `<label>`) para que el nombre
 * accesible del control sea sólo el label, igual que antes con el checkbox.
 */
export function Switch({ id, checked, onChange, label, description, disabled = false }: SwitchProps) {
  const descriptionId = description ? `${id}-description` : undefined;

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex flex-col gap-0.5 pr-4">
        <label htmlFor={id} className={clsx('text-sm font-medium text-slate-800', !disabled && 'cursor-pointer')}>
          {label}
        </label>
        {description && (
          <p id={descriptionId} className="text-xs leading-relaxed text-slate-500">
            {description}
          </p>
        )}
      </div>
      <button
        type="button"
        id={id}
        role="switch"
        aria-checked={checked}
        aria-describedby={descriptionId}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={clsx(
          'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2',
          checked ? 'bg-brand-600' : 'bg-slate-300',
          disabled && 'cursor-not-allowed opacity-60',
        )}
      >
        <span
          aria-hidden="true"
          className={clsx(
            'inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform duration-200',
            checked ? 'translate-x-[22px]' : 'translate-x-0.5',
          )}
        />
      </button>
    </div>
  );
}
