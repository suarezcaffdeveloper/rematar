import type { LucideIcon } from 'lucide-react';
import clsx from 'clsx';

export interface DashboardStatCardProps {
  label: string;
  formattedValue: string;
  icon: LucideIcon;
  /** Clases Tailwind para el fondo/texto del ícono, ej. `bg-brand-50 text-brand-600`. */
  toneClassName: string;
  /** Punto pulsante junto al ícono -- reservado para el estado "en vivo". */
  pulse?: boolean;
  className?: string;
}

/**
 * Celda de la franja de estadísticas del Dashboard del Rematador (retexturizado en la
 * Épica 9, Etapa 9 -- ver prototipo aprobado): antes era una tarjeta con su propio
 * `border`+`shadow`+`rounded-2xl`, siete veces seguidas -- justo el patrón de "más
 * cards" que el rediseño pidió evitar. Ahora es una celda abierta (sin borde ni sombra
 * propios); es `RematadorDashboardStats` quien dibuja un único contenedor con
 * `divide-x`/`divide-y` alrededor de todas las celdas, así la separación se lee como
 * una sola franja de datos, no siete widgets sueltos.
 *
 * Mantiene la misma estructura DOM que antes (label y valor como hermanos directos, en
 * ese orden) para que `RematadorDashboardStats.test.tsx`
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
    <div className={clsx('flex min-w-0 items-center gap-3 px-4 py-3.5', className)}>
      <div className={clsx('relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', toneClassName)}>
        <Icon aria-hidden="true" className="h-4 w-4" />
        {pulse && (
          <span className="absolute -right-0.5 -top-0.5 flex h-2 w-2" aria-hidden="true">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-warning-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-warning-500" />
          </span>
        )}
      </div>
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-xs font-medium uppercase tracking-wide text-ink-faint">{label}</span>
        <span className="text-lg font-semibold tabular-nums text-ink">{formattedValue}</span>
      </div>
    </div>
  );
}
