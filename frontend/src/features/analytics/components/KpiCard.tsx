import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { TrendDownIcon, TrendUpIcon } from './icons';

export interface KpiCardProps {
  label: string;
  /** Numérico, para poder comparar contra el valor anterior y mostrar la flecha de
   * tendencia -- el texto que efectivamente se muestra es `formattedValue`. */
  value: number;
  formattedValue: string;
  /** `false` para métricas donde "más" no es necesariamente "mejor" (ej. tiempo
   * promedio por lote) -- no tiene sentido una flecha verde/roja ahí. */
  showTrend?: boolean;
}

/** Tarjeta KPI -- etiqueta + número grande + flecha de tendencia (color + ícono, nunca
 * solo color) + pulso breve al cambiar. Mismo criterio visual que `PresenceCounter`
 * (`features/sala/components/`, Épica 6.2). */
export function KpiCard({ label, value, formattedValue, showTrend = true }: KpiCardProps) {
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
    <div className="flex flex-col gap-1 rounded-xl border border-slate-200 bg-white p-3">
      <span className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</span>
      <span className="flex items-center gap-1.5">
        <span
          className={clsx(
            'text-xl font-semibold text-slate-900 transition-colors duration-300 sm:text-2xl',
            isPulsing && 'text-brand-600',
          )}
        >
          {formattedValue}
        </span>
        {showTrend && trend && (
          <span
            className={clsx(
              'flex items-center',
              trend === 'up' ? 'text-success-600' : 'text-danger-600',
            )}
          >
            {trend === 'up' ? (
              <TrendUpIcon className="h-3.5 w-3.5" />
            ) : (
              <TrendDownIcon className="h-3.5 w-3.5" />
            )}
          </span>
        )}
      </span>
    </div>
  );
}
