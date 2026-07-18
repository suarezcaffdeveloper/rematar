import { useMemo } from 'react';
import clsx from 'clsx';
import { STATUS_LABELS } from '../../remates/labels';
import type { Remate, RemateStatus } from '../../remates/types';

export interface RematadorDashboardStatsProps {
  remates: Remate[];
}

const ACCENT_CLASSES: Record<RemateStatus, string> = {
  draft: 'bg-slate-300',
  scheduled: 'bg-brand-500',
  live: 'bg-amber-500',
  paused: 'bg-slate-400',
  finished: 'bg-success-500',
  cancelled: 'bg-danger-500',
};

// Orden pensado para lectura operativa: lo que está pasando ahora primero, lo que ya
// terminó al final -- distinto del orden alfabético o del de `ALL_STATUS_OPTIONS`
// (pensado para un `<select>`, no para una fila de indicadores).
const STATS_ORDER: RemateStatus[] = ['live', 'paused', 'scheduled', 'draft', 'finished', 'cancelled'];

function StatChip({ label, value, accentClassName }: { label: string; value: number; accentClassName: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className={clsx('h-8 w-1.5 shrink-0 rounded-full', accentClassName)} aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-lg font-bold leading-none text-slate-900">{value}</p>
        <p className="mt-1 truncate text-xs text-slate-500">{label}</p>
      </div>
    </div>
  );
}

/**
 * Fila de indicadores del dashboard -- pedido explícito de este módulo: "apariencia de
 * consola profesional", sin tablas. Se calcula client-side sobre la misma lista ya
 * cargada por `useRemates` (`RematadorDashboardPage`), sin ningún endpoint nuevo.
 */
export function RematadorDashboardStats({ remates }: RematadorDashboardStatsProps) {
  const counts = useMemo(() => {
    const initial: Record<RemateStatus, number> = {
      draft: 0,
      scheduled: 0,
      live: 0,
      paused: 0,
      finished: 0,
      cancelled: 0,
    };
    return remates.reduce((acc, remate) => {
      acc[remate.status] += 1;
      return acc;
    }, initial);
  }, [remates]);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      <StatChip label="Total" value={remates.length} accentClassName="bg-slate-800" />
      {STATS_ORDER.map((status) => (
        <StatChip key={status} label={STATUS_LABELS[status]} value={counts[status]} accentClassName={ACCENT_CLASSES[status]} />
      ))}
    </div>
  );
}
