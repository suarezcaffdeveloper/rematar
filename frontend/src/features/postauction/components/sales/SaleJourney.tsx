import { useState } from 'react';
import { ArrowRight, Check } from 'lucide-react';
import { Button } from '../../../../shared/components/Button';
import { formatDateTime } from '../../../../shared/lib/format';
import { STATUS_LABELS, STATUS_ORDER } from '../../labels';
import { NEXT_ACTIONS, dateReached, statusIndex } from '../../sales';
import type { PostAuctionCaseDetail, PostAuctionStatus } from '../../types';
import { StatusChangeDialog } from './StatusChangeDialog';

export interface SaleJourneyProps {
  data: PostAuctionCaseDetail;
  /** "Pago pendiente hace 6 días", o `null` si la venta va dentro de lo normal. */
  late: string | null;
  onChanged: () => void;
}

/**
 * El recorrido de la venta: los 8 estados en orden, con la fecha en la que se llegó a cada
 * uno (del timeline), los pasos salteados marcados como tales, y en el paso actual el
 * próximo paso con su botón. Los estados que faltan ofrecen "Pasar directo a este estado"
 * -- un salto que el backend permite -- y el diálogo avisa lo que implica (ver
 * `StatusChangeDialog`). Reemplaza al stepper de círculos + el select de "Cambiar estado".
 */
export function SaleJourney({ data, late, onChanged }: SaleJourneyProps) {
  const [target, setTarget] = useState<PostAuctionStatus | null>(null);
  const current = statusIndex(data.status);
  const next = NEXT_ACTIONS[data.status];
  const nextTarget = STATUS_ORDER[current + 1] ?? null;

  return (
    <>
      <ol className="border-t border-ink">
        {STATUS_ORDER.map((status, index) => {
          const reached = dateReached(status, data.timeline, data.created_at);
          const isDone = index < current;
          const isCurrent = index === current;
          const isSkipped = isDone && !reached;
          return (
            <li
              key={status}
              aria-current={isCurrent ? 'step' : undefined}
              className="grid grid-cols-[2.2rem_minmax(0,1fr)] gap-4 border-b border-line py-5"
            >
              <span
                className={`flex h-[30px] w-[30px] items-center justify-center rounded-full border-2 text-xs font-bold ${
                  isSkipped
                    ? 'border-dashed border-line-strong text-ink-faint'
                    : isDone
                      ? 'border-ink bg-ink text-white'
                      : isCurrent
                        ? late
                          ? 'border-warning-500 text-warning-700 shadow-[0_0_0_4px_#fef3c7]'
                          : 'border-brand-600 text-brand-600 shadow-[0_0_0_4px_var(--color-brand-100)]'
                        : 'border-line-strong bg-white text-ink-faint'
                }`}
              >
                {isDone && !isSkipped ? <Check aria-hidden="true" className="h-3.5 w-3.5" /> : index + 1}
              </span>
              <div className="min-w-0">
                <h3 className={`text-lg leading-tight tracking-tight ${index > current ? 'font-medium text-ink-muted' : 'font-semibold'}`}>
                  {STATUS_LABELS[status]}
                </h3>
                <p className="mt-0.5 text-sm text-ink-muted">
                  {isSkipped ? 'Salteado: este paso quedó sin fecha.' : reached ? formatDateTime(reached) : index > current ? 'Todavía no llegó.' : '—'}
                </p>

                {isCurrent && (
                  <div className={`mt-3 grid justify-items-start gap-3 rounded-2xl p-4 ${next ? (late ? 'bg-danger-50' : 'bg-brand-50') : 'bg-success-50'}`}>
                    {next ? (
                      <>
                        <p className="max-w-[54ch] text-sm">
                          {late && <span className="font-semibold text-danger-600">{late}. </span>}
                          {next.hint}
                        </p>
                        {nextTarget && (
                          <Button variant={late ? 'primary' : 'hero'} onClick={() => setTarget(nextTarget)}>
                            {next.label}
                            <ArrowRight aria-hidden="true" className="h-4 w-4" />
                          </Button>
                        )}
                      </>
                    ) : (
                      <p className="text-sm">Esta venta está cerrada. Pago, entrega y documentación resueltos.</p>
                    )}
                  </div>
                )}

                {index > current && (
                  <button
                    type="button"
                    onClick={() => setTarget(status)}
                    className="mt-1.5 rounded text-sm font-semibold text-brand-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                  >
                    Pasar directo a este estado
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {target && (
        <StatusChangeDialog
          isOpen
          onClose={() => setTarget(null)}
          caseId={data.id}
          loteTitle={data.lote_title}
          buyerName={data.buyer_name}
          from={data.status}
          to={target}
          onChanged={onChanged}
        />
      )}
    </>
  );
}
