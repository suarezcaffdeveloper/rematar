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
 * `STATUS_ORDER` -- no valida transiciones (eso ya lo hace el backend). Una sola fila
 * siempre (`flex-nowrap`): en pantallas angostas los 8 pasos no entran, así que en vez de
 * `flex-wrap` (que antes rompía la alineación de los conectores al partir la fila) se
 * scrollea horizontalmente -- mismo patrón que `LoteResultCarousel`.
 */
export function ProgressStepper({ status }: ProgressStepperProps) {
  const currentIndex = STATUS_ORDER.indexOf(status);

  return (
    <ol
      className="flex flex-nowrap items-start overflow-x-auto pb-1 pl-1 pr-3 pt-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      aria-label="Progreso del proceso post-remate"
    >
      {STATUS_ORDER.map((step, index) => {
        const isDone = index < currentIndex;
        const isCurrent = index === currentIndex;
        return (
          <li key={step} className="flex shrink-0 items-start">
            <div className="flex w-16 flex-col items-center gap-1.5 sm:w-20">
              <span
                className={clsx(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors duration-200',
                  isDone && 'bg-success-50 text-success-600 ring-1 ring-inset ring-success-200',
                  isCurrent && 'bg-brand-600 text-white shadow-sm ring-4 ring-brand-100',
                  !isDone && !isCurrent && 'bg-slate-100 text-slate-400',
                )}
                aria-current={isCurrent ? 'step' : undefined}
              >
                {isDone ? <Check aria-hidden="true" className="h-4 w-4" /> : index + 1}
              </span>
              <span
                className={clsx(
                  'text-center text-[11px] leading-tight',
                  isCurrent ? 'font-semibold text-slate-900' : 'text-slate-500',
                )}
              >
                {STATUS_LABELS[step]}
              </span>
            </div>
            {index < STATUS_ORDER.length - 1 && (
              <span
                className={clsx(
                  'mx-1 mt-4 h-0.5 w-4 shrink-0 rounded-full transition-colors duration-200 sm:w-8',
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
