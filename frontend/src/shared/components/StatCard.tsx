import { useEffect, useRef, useState } from 'react';
import { TrendingDown, TrendingUp } from 'lucide-react';
import clsx from 'clsx';

export interface StatCardProps {
  label: string;
  /** Numérico, para poder comparar contra el valor anterior y mostrar la flecha de
   * tendencia -- el texto que efectivamente se muestra es `formattedValue`. */
  value: number;
  formattedValue: string;
  /** `false` para métricas donde "más" no es necesariamente "mejor", o donde un cambio
   * no aporta nada (ej. conteo de remates `draft`, tiempos de respuesta, valores ya
   * congelados). Default `true` -- coincide con el criterio original de `KpiCard`
   * (Épica 7.1): la mayoría de los usos actuales sí quieren la flecha. */
  showTrend?: boolean;
  /** Barra de acento a la izquierda -- clase de color Tailwind (ej. `bg-brand-500`).
   * Sin esto, la tarjeta es el estilo "KPI" simple (sin barra). Ignorado si `centered`. */
  accentClassName?: string;
  /** Layout alternativo: label y valor centrados en columna, sin barra de acento, y el
   * label puede pasar a un segundo renglón en vez de truncarse con "...". Pensado para
   * grillas densas de KPIs (informe ejecutivo de historial) donde se prioriza que se lea
   * la etiqueta completa por sobre una única línea prolija. */
  centered?: boolean;
  className?: string;
}

/**
 * Tarjeta de estadística genérica (Épica 9, Etapa 3 -- rediseño): unifica lo que antes
 * eran dos componentes casi idénticos, `features/analytics/components/KpiCard.tsx`
 * (label + valor + flecha de tendencia + pulso al cambiar, usado en Analítica/
 * Monitoreo/Historial) y el `StatChip` local de `RematadorDashboardStats.tsx` (valor +
 * barra de acento + label, sin tendencia). Un único componente con ambas capacidades
 * como opt-in (`showTrend`/`accentClassName`) reemplaza a los dos.
 */
export function StatCard({
  label,
  value,
  formattedValue,
  showTrend = true,
  accentClassName,
  centered = false,
  className,
}: StatCardProps) {
  const [isPulsing, setIsPulsing] = useState(false);
  const [trend, setTrend] = useState<'up' | 'down' | null>(null);
  const previousValueRef = useRef(value);

  useEffect(() => {
    if (previousValueRef.current === value) return;
    setTrend(value > previousValueRef.current ? 'up' : 'down');
    previousValueRef.current = value;
    setIsPulsing(true);
    const timeout = setTimeout(() => setIsPulsing(false), 300);
    return () => clearTimeout(timeout);
  }, [value]);

  return (
    <div
      className={clsx(
        'flex rounded-xl border border-slate-200 bg-white shadow-sm',
        centered ? 'flex-col items-center gap-1 p-4 text-center' : 'items-center gap-3 p-3',
        className,
      )}
    >
      {!centered && accentClassName && (
        <div className={clsx('h-8 w-1.5 shrink-0 rounded-full', accentClassName)} aria-hidden="true" />
      )}
      <div className={clsx(centered ? 'flex flex-col items-center gap-1' : 'min-w-0 flex-1')}>
        <span
          className={clsx(
            'text-xs font-medium uppercase tracking-wide text-slate-500',
            centered ? 'break-words' : 'block truncate',
          )}
        >
          {label}
        </span>
        <span className={clsx('flex items-center gap-1.5', centered && 'justify-center')}>
          <span
            className={clsx(
              'text-lg font-semibold text-slate-900 transition-colors duration-300 sm:text-xl',
              isPulsing && 'text-brand-600',
            )}
          >
            {formattedValue}
          </span>
          {showTrend && trend && (
            <span className={clsx('flex items-center', trend === 'up' ? 'text-success-600' : 'text-danger-600')}>
              {trend === 'up' ? (
                <TrendingUp aria-hidden="true" className="h-3.5 w-3.5" />
              ) : (
                <TrendingDown aria-hidden="true" className="h-3.5 w-3.5" />
              )}
            </span>
          )}
        </span>
      </div>
    </div>
  );
}
