import { useMemo } from 'react';
import { StatCard } from '../../../shared/components/StatCard';
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

/**
 * Fila de indicadores del dashboard -- pedido explícito de este módulo: "apariencia de
 * consola profesional", sin tablas. Se calcula client-side sobre la misma lista ya
 * cargada por `useRemates` (`RematadorDashboardPage`), sin ningún endpoint nuevo.
 * Reusa `StatCard` (`shared/components/`, Épica 9 Etapa 3) en vez de un `StatChip`
 * local -- mismo componente que Analítica/Monitoreo/Historial, `showTrend={false}`
 * porque un conteo por categoría no necesita flecha de tendencia.
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
      <StatCard
        label="Total"
        value={remates.length}
        formattedValue={String(remates.length)}
        accentClassName="bg-slate-800"
        showTrend={false}
      />
      {STATS_ORDER.map((status) => (
        <StatCard
          key={status}
          label={STATUS_LABELS[status]}
          value={counts[status]}
          formattedValue={String(counts[status])}
          accentClassName={ACCENT_CLASSES[status]}
          showTrend={false}
        />
      ))}
    </div>
  );
}
