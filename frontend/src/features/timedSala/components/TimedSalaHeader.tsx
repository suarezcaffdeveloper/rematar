import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatDateTime } from '../../../shared/lib/format';
import type { Remate } from '../../remates/types';

export interface TimedSalaHeaderProps {
  remate: Remate;
  openCount: number;
  totalCount: number;
}

/**
 * Cabecera de la Sala Timed: volver a la ficha del remate, su título y dos datos que
 * sirven para orientarse -- cuántos lotes siguen abiertos y cuándo termina el remate. No
 * repite la descripción del remate (está en su ficha); la sala es para ofertar.
 */
export function TimedSalaHeader({ remate, openCount, totalCount }: TimedSalaHeaderProps) {
  return (
    <header className="flex items-center gap-4 pb-4 pt-4">
      <Link
        to={`/remates/${remate.id}`}
        aria-label="Volver al remate"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line text-ink-muted transition-colors hover:border-ink hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
      >
        <ArrowLeft aria-hidden="true" className="h-4 w-4" />
      </Link>
      <div className="min-w-0">
        <h1 className="truncate text-lg font-bold tracking-tight text-ink sm:text-xl">{remate.title}</h1>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-ink-muted">
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-success-500" />
            {openCount === 1 ? '1 lote abierto' : `${openCount} lotes abiertos`} de {totalCount}
          </span>
          {remate.ends_at && <span>Termina el {formatDateTime(remate.ends_at)}</span>}
        </p>
      </div>
    </header>
  );
}
