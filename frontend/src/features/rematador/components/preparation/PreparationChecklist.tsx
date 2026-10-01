import { AlertTriangle, Check, Info, X } from 'lucide-react';
import { Button } from '../../../../shared/components/Button';
import type { ChecklistAction, ChecklistItem, ChecklistState } from '../../preparation';

const STATE_LABEL: Record<ChecklistState, string> = {
  ok: 'Listo',
  blocker: 'Falta',
  recommended: 'Recomendado',
  later: 'Después',
};

const STATE_TONE: Record<ChecklistState, string> = {
  ok: 'text-success-700',
  blocker: 'text-danger-600',
  recommended: 'text-warning-700',
  later: 'text-ink-muted',
};

const STATE_ICON: Record<ChecklistState, typeof Check> = {
  ok: Check,
  blocker: X,
  recommended: AlertTriangle,
  later: Info,
};

export interface PreparationChecklistProps {
  items: ChecklistItem[];
  onAction: (action: ChecklistAction) => void;
  /** Con la estructura congelada no hay nada que completar: se oculta la columna de acciones. */
  readOnly?: boolean;
}

/**
 * "Antes de publicar": lo obligatorio y lo recomendado, como índice tipográfico (línea `ink`
 * arriba, filas separadas por `line`, y al pasar el mouse sobre una fila las demás se
 * atenúan) -- mismo lenguaje que "Qué hacer ahora" del panel principal. El estado va siempre
 * con ícono y texto, nunca solo con color.
 */
export function PreparationChecklist({ items, onAction, readOnly = false }: PreparationChecklistProps) {
  return (
    <ul className="border-t border-ink [&:hover>li:not(:hover)]:opacity-45">
      {items.map((item) => {
        const Icon = STATE_ICON[item.state];
        return (
          <li
            key={item.key}
            className="grid grid-cols-1 items-center gap-2 border-b border-line py-5 transition-opacity duration-300 md:grid-cols-[11rem_minmax(0,1fr)_auto] md:gap-5"
          >
            <span className={`flex items-center gap-2.5 text-sm font-semibold ${STATE_TONE[item.state]}`}>
              <Icon aria-hidden="true" className="h-4 w-4" />
              {STATE_LABEL[item.state]}
            </span>
            <div className="min-w-0">
              <h3 className="text-lg font-semibold leading-snug tracking-tight sm:text-xl">{item.label}</h3>
              <p className="mt-0.5 max-w-[68ch] text-sm text-ink-muted">{item.detail}</p>
            </div>
            {item.action && !readOnly ? (
              <Button
                variant={item.state === 'blocker' ? 'primary' : 'secondary'}
                className="w-fit rounded-full px-5"
                onClick={() => onAction(item.action!.type)}
              >
                {item.action.label}
              </Button>
            ) : (
              <span />
            )}
          </li>
        );
      })}
    </ul>
  );
}
