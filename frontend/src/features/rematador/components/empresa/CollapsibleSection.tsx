import { useId, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { Check, ChevronDown } from 'lucide-react';

export interface SectionStatus {
  tone: 'ok' | 'warn' | 'mute';
  label: string;
}

export interface CollapsibleSectionProps {
  title: string;
  hint: string;
  defaultOpen: boolean;
  /** Ícono o insignia a la izquierda del título (puede ser a color). */
  leading?: ReactNode;
  /** Contador junto al título (ej. cantidad de lotes). */
  count?: number;
  /** Con `count`: pinta el contador de amarillo cuando es mayor a cero. */
  attention?: boolean;
  /** Estado en una palabra ("Listo", "Falta cargar"). */
  status?: SectionStatus;
  /** Texto corto a la derecha del título. */
  aside?: ReactNode;
  children: ReactNode;
}

const STATUS_TONES: Record<SectionStatus['tone'], string> = {
  ok: 'bg-success-50 text-success-700',
  warn: 'bg-warning-100 text-warning-800',
  mute: 'bg-surface-subtle text-ink-muted ring-1 ring-line',
};

/** Apartado plegable de la Cabina: línea gruesa arriba, título grande y un botón que
 * muestra u oculta el contenido (el título y el estado quedan siempre a la vista). */
export function CollapsibleSection({ title, hint, defaultOpen, leading, count, attention, status, aside, children }: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();

  return (
    <section aria-label={title} className="border-t-2 border-ink">
      <h2>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls={panelId}
          className="group flex w-full items-start justify-between gap-4 py-5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          <span className="flex min-w-0 items-start gap-4">
            {leading}
            <span className="min-w-0">
              <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-2xl font-semibold tracking-tight text-ink">{title}</span>
                {count !== undefined && (
                  <span
                    className={clsx(
                      'rounded-full px-2.5 py-0.5 text-sm font-semibold tabular-nums',
                      attention && count > 0 ? 'bg-warning-100 text-warning-800' : 'bg-surface-subtle text-ink-muted ring-1 ring-line',
                    )}
                  >
                    {count}
                  </span>
                )}
                {status && (
                  <span className={clsx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-sm font-semibold', STATUS_TONES[status.tone])}>
                    {status.tone === 'ok' && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                    {status.label}
                  </span>
                )}
              </span>
              <span className="mt-1 block max-w-2xl text-sm font-normal text-ink-muted">{hint}</span>
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-4 pt-1">
            {aside && <span className="hidden text-right text-sm text-ink-muted sm:block">{aside}</span>}
            <span className="flex items-center gap-1.5 text-sm font-semibold text-ink-muted group-hover:text-ink">
              <span className="hidden sm:inline">{open ? 'Ocultar' : 'Mostrar'}</span>
              <ChevronDown
                className={clsx('h-5 w-5 transition-transform duration-200 motion-reduce:transition-none', open && 'rotate-180')}
                aria-hidden="true"
              />
            </span>
          </span>
        </button>
      </h2>
      <div
        id={panelId}
        className={clsx('grid transition-[grid-template-rows] duration-300 motion-reduce:transition-none', open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}
      >
        <div className="min-h-0 overflow-hidden" {...(open ? {} : { inert: true })}>
          <div className="pb-10">{children}</div>
        </div>
      </div>
    </section>
  );
}
