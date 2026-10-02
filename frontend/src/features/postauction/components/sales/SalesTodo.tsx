import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Clock, PencilLine, type LucideIcon } from 'lucide-react';
import { Button } from '../../../../shared/components/Button';
import { NEXT_ACTIONS, type SalesTask, type SalesTaskSeverity } from '../../sales';
import type { PostAuctionCase } from '../../types';
import { SaleCover } from './SaleCover';

const VISIBLE_TASKS = 4;

const SEVERITY: Record<SalesTaskSeverity, { label: string; icon: LucideIcon; tone: string }> = {
  urgent: { label: 'Urgente', icon: AlertTriangle, tone: 'text-danger-600' },
  warn: { label: 'Atención', icon: Clock, tone: 'text-warning-700' },
  todo: { label: 'Para hacer', icon: PencilLine, tone: 'text-brand-700' },
};

export interface SalesTodoProps {
  tasks: SalesTask[];
  /** Abre la confirmación del próximo paso de esa venta. */
  onAdvance: (item: PostAuctionCase) => void;
}

/**
 * "Qué hacer ahora": las ventas que están frenando un cobro o una entrega, como índice
 * tipográfico (línea `ink` arriba, filas separadas por `line`, y al pasar el mouse las demás
 * se atenúan) -- mismo lenguaje que "Qué hacer ahora" del panel principal. Cada fila trae el
 * botón del próximo paso: no hace falta entrar a la venta para avanzarla.
 */
export function SalesTodo({ tasks, onAdvance }: SalesTodoProps) {
  const [showAll, setShowAll] = useState(false);

  if (tasks.length === 0) {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-line bg-surface-subtle p-6">
        <CheckCircle2 aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-success-600" />
        <div>
          <h3 className="text-lg font-semibold tracking-tight">Todo al día</h3>
          <p className="mt-1 text-ink-muted">No hay ventas esperando que hagas algo. Cuando se adjudique un lote, aparece acá primero.</p>
        </div>
      </div>
    );
  }

  const visible = showAll ? tasks : tasks.slice(0, VISIBLE_TASKS);
  const hidden = tasks.length - VISIBLE_TASKS;

  return (
    <div>
      <ul className="border-t border-ink [&:hover>li:not(:hover)]:opacity-40">
        {visible.map((task) => {
          const { label, icon: Icon, tone } = SEVERITY[task.severity];
          const next = NEXT_ACTIONS[task.item.status];
          return (
            <li
              key={task.id}
              className="grid grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-x-4 gap-y-3 border-b border-line py-5 transition-opacity duration-300 md:grid-cols-[9.5rem_3.5rem_minmax(0,1fr)_auto] md:gap-x-5"
            >
              <span className={`col-span-full flex items-center gap-2 text-sm font-semibold md:col-span-1 ${tone}`}>
                <Icon aria-hidden="true" className="h-4 w-4" />
                {label}
              </span>
              <Link to={`/ventas-adjudicadas/${task.item.id}`} aria-hidden="true" tabIndex={-1} className="block h-11 w-14 overflow-hidden rounded-[10px]">
                <SaleCover url={task.item.lote_cover_image_url} className="h-full w-full" />
              </Link>
              <div className="min-w-0">
                <h3 className="text-lg font-semibold leading-snug tracking-tight sm:text-xl">
                  <Link to={`/ventas-adjudicadas/${task.item.id}`} className="hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
                    {task.title}
                  </Link>
                </h3>
                <p className="mt-1 max-w-[68ch] text-ink-muted">{task.description}</p>
              </div>
              {next && (
                <Button
                  variant={task.severity === 'urgent' ? 'primary' : 'secondary'}
                  className="col-span-full w-fit rounded-full px-5 md:col-span-1"
                  onClick={() => onAdvance(task.item)}
                >
                  {next.label}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setShowAll((value) => !value)}
          aria-expanded={showAll}
          className="mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold text-ink-muted transition-colors hover:bg-surface-subtle hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          {showAll ? 'Ver menos' : `Ver las ${hidden} restantes`}
          {showAll ? <ChevronUp aria-hidden="true" className="h-4 w-4" /> : <ChevronDown aria-hidden="true" className="h-4 w-4" />}
        </button>
      )}
    </div>
  );
}
