import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Clock, Info, PencilLine, type LucideIcon } from 'lucide-react';
import type { DashboardTask, TaskSeverity } from '../../dashboard';

const VISIBLE_TASKS = 4;

const SEVERITY: Record<TaskSeverity, { label: string; icon: LucideIcon; tone: string; button: string }> = {
  urgent: { label: 'Urgente', icon: AlertTriangle, tone: 'text-danger-600', button: 'bg-brand-600 text-white hover:bg-brand-700' },
  warn: { label: 'Atención', icon: Clock, tone: 'text-warning-700', button: 'border border-line-strong bg-white text-ink hover:border-ink' },
  todo: { label: 'Pendiente', icon: PencilLine, tone: 'text-brand-700', button: 'border border-line-strong bg-white text-ink hover:border-ink' },
  info: { label: 'Aviso', icon: Info, tone: 'text-ink-muted', button: 'border border-line-strong bg-white text-ink hover:border-ink' },
};

/**
 * "Qué hacer ahora": índice tipográfico de lo que necesita atención, ordenado por
 * urgencia (el orden lo decide `buildPendingTasks`). Mismo lenguaje que `RemateIndex` del
 * comprador: línea superior `ink`, filas separadas por `line`, y al pasar el mouse sobre
 * una fila las demás se atenúan. La severidad va siempre con ícono y texto, no solo color.
 */
export function PendingTasks({ tasks }: { tasks: DashboardTask[] }) {
  const [showAll, setShowAll] = useState(false);

  if (tasks.length === 0) {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-line bg-surface-subtle p-6">
        <CheckCircle2 aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-success-600" />
        <div>
          <h3 className="text-lg font-semibold tracking-tight">Todo al día</h3>
          <p className="mt-1 text-ink-muted">No hay nada pendiente. Cuando haya algo para resolver, aparece acá primero.</p>
        </div>
      </div>
    );
  }

  const visible = showAll ? tasks : tasks.slice(0, VISIBLE_TASKS);
  const hiddenCount = tasks.length - VISIBLE_TASKS;

  return (
    <div>
      <ul className="border-t border-ink [&:hover>li:not(:hover)]:opacity-40">
        {visible.map((task) => {
          const { label, icon: Icon, tone, button } = SEVERITY[task.severity];
          return (
            <li
              key={task.id}
              className="grid grid-cols-1 items-center gap-3 border-b border-line py-5 transition-opacity duration-300 md:grid-cols-[9.5rem_minmax(0,1fr)_auto] md:gap-5"
            >
              <span className={`flex items-center gap-2 text-sm font-semibold ${tone}`}>
                <Icon aria-hidden="true" className="h-4 w-4" />
                {label}
              </span>
              <div className="min-w-0">
                <h3 className="text-lg font-semibold leading-snug tracking-tight sm:text-xl">{task.title}</h3>
                <p className="mt-1 max-w-[70ch] text-ink-muted">{task.description}</p>
              </div>
              <Link
                to={task.to}
                className={`inline-flex w-fit items-center justify-center whitespace-nowrap rounded-full px-5 py-2.5 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 ${button}`}
              >
                {task.actionLabel}
              </Link>
            </li>
          );
        })}
      </ul>
      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setShowAll((value) => !value)}
          aria-expanded={showAll}
          className="mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold text-ink-muted transition-colors hover:bg-surface-subtle hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          {showAll ? 'Ver menos' : `Ver las ${hiddenCount} restantes`}
          {showAll ? <ChevronUp aria-hidden="true" className="h-4 w-4" /> : <ChevronDown aria-hidden="true" className="h-4 w-4" />}
        </button>
      )}
    </div>
  );
}
