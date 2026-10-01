import clsx from 'clsx';
import { LiveDot } from '../../../remates/components/home/LiveDot';
import type { Remate, RemateStatus } from '../../../remates/types';
import { statusLabel } from '../../dashboard';

const TONE_CLASSES: Record<RemateStatus, string> = {
  draft: 'border border-line bg-surface-subtle text-ink-muted',
  scheduled: 'bg-brand-50 text-brand-700',
  live: 'bg-success-50 text-success-700',
  paused: 'bg-warning-50 text-warning-700',
  finished: 'bg-slate-100 text-slate-700',
  cancelled: 'bg-danger-50 text-danger-700',
};

/**
 * Estado de un remate como píldora. Un Timed en curso dice "En curso" (no "En vivo": no hay
 * sala ni martillo), y el pausado lleva su propio punto ámbar -- el estado nunca se comunica
 * solo con color, siempre va con el texto.
 */
export function RemateStatusPill({
  remate,
  className,
  onDark = false,
}: {
  remate: Remate;
  className?: string;
  /** Sobre una foto/oscuro: fondo translúcido en vez del tono de estado. */
  onDark?: boolean;
}) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold',
        onDark ? 'bg-white/15 text-white backdrop-blur-md' : TONE_CLASSES[remate.status],
        className,
      )}
    >
      {remate.status === 'live' && <LiveDot />}
      {remate.status === 'paused' && <span aria-hidden="true" className="h-2 w-2 rounded-full bg-warning-500" />}
      {statusLabel(remate)}
    </span>
  );
}
