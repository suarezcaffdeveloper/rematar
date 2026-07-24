import { Check } from 'lucide-react';
import clsx from 'clsx';
import { STATUS_LABELS, STATUS_ORDER } from '../labels';
import type { PostAuctionStatus } from '../types';

export interface ProgressStepperProps {
  status: PostAuctionStatus;
}

/**
 * Indicador visual de progreso sobre los 8 estados del flujo post-remate (pedido
 * explícito del enunciado, "indicadores visuales de progreso"). Pura lectura de
 * `STATUS_ORDER` -- no valida transiciones (eso ya lo hace el backend). `flex-wrap`
 * para que se acomode en pantallas angostas en vez de forzar scroll horizontal.
 */
export function ProgressStepper({ status }: ProgressStepperProps) {
  const currentIndex = STATUS_ORDER.indexOf(status);

  return (
    <ol className="flex flex-wrap items-center gap-y-3" aria-label="Progreso del proceso post-remate">
      {STATUS_ORDER.map((step, index) => {
        const isDone = index < currentIndex;
        const isCurrent = index === currentIndex;
        return (
          <li key={step} className="flex items-center">
            <div className="flex flex-col items-center gap-1">
              <span
                className={clsx(
                  'flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold',
                  isDone && 'bg-success-50 text-success-600',
                  isCurrent && 'bg-brand-600 text-white',
                  !isDone && !isCurrent && 'bg-slate-100 text-slate-400',
                )}
                aria-current={isCurrent ? 'step' : undefined}
              >
                {isDone ? <Check aria-hidden="true" className="h-4 w-4" /> : index + 1}
              </span>
              <span
                className={clsx(
                  'max-w-[5.5rem] text-center text-[11px] leading-tight',
                  isCurrent ? 'font-semibold text-slate-900' : 'text-slate-500',
                )}
              >
                {STATUS_LABELS[step]}
              </span>
            </div>
            {index < STATUS_ORDER.length - 1 && (
              <span
                className={clsx(
                  'mx-1 mb-4 h-0.5 w-6 sm:w-10',
                  isDone ? 'bg-success-400' : 'bg-slate-200',
                )}
                aria-hidden="true"
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
