import type { LucideIcon } from 'lucide-react';
import clsx from 'clsx';

export interface DashboardStatCardProps {
  label: string;
  formattedValue: string;
  icon: LucideIcon;
  /** Clases Tailwind para el fondo/texto del ícono, ej. `bg-brand-50 text-brand-600`. */
  toneClassName: string;
  /** Punto pulsante junto al label -- reservado para el estado "en vivo". */
  pulse?: boolean;
  className?: string;
}

/**
 * Tarjeta de estadística del Dashboard del Rematador (Épica 9, Etapa 5 -- rediseño
 * visual): reemplaza al `StatCard` compartido *solo acá*, para no arrastrar este look
 * más grande/decorado a Analítica/Monitoreo/Historial (que siguen con `StatCard`, ver
 * `shared/components/StatCard.tsx`). Mantiene la misma estructura DOM que `StatCard`
 * (label y valor como hermanos directos) para que `RematadorDashboardStats.test.tsx`
 * (`getByText(label).nextElementSibling`) siga funcionando igual.
 */
export function DashboardStatCard({
  label,
  formattedValue,
  icon: Icon,
  toneClassName,
  pulse = false,
  className,
}: DashboardStatCardProps) {
  return (
    <div
      className={clsx(
        'group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm',
        'transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md',
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <div className={clsx('flex h-9 w-9 items-center justify-center rounded-xl', toneClassName)}>
          <Icon aria-hidden="true" className="h-5 w-5" />
        </div>
        {pulse && (
          <span className="relative flex h-2.5 w-2.5" aria-hidden="true">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-warning-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-warning-500" />
          </span>
        )}
      </div>
      <span className="mt-3 block truncate text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <span className="mt-0.5 block text-2xl font-bold tabular-nums text-slate-900">{formattedValue}</span>
    </div>
  );
}
