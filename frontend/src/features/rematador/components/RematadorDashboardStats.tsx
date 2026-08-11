import { useMemo } from 'react';
import { CalendarClock, CheckCircle2, FileEdit, Gavel, PauseCircle, Radio, XCircle, type LucideIcon } from 'lucide-react';
import { DashboardStatCard } from './DashboardStatCard';
import { STATUS_LABELS } from '../../remates/labels';
import type { Remate, RemateStatus } from '../../remates/types';

export interface RematadorDashboardStatsProps {
  remates: Remate[];
}

const ICONS: Record<RemateStatus, LucideIcon> = {
  draft: FileEdit,
  scheduled: CalendarClock,
  live: Radio,
  paused: PauseCircle,
  finished: CheckCircle2,
  cancelled: XCircle,
};

const TONE_CLASSES: Record<RemateStatus, string> = {
  draft: 'bg-slate-100 text-slate-500',
  scheduled: 'bg-brand-50 text-brand-600',
  live: 'bg-warning-50 text-warning-600',
  paused: 'bg-slate-100 text-slate-500',
  finished: 'bg-success-50 text-success-600',
  cancelled: 'bg-danger-50 text-danger-600',
};

// Orden pensado para lectura operativa: lo que está pasando ahora primero, lo que ya
// terminó al final -- distinto del orden alfabético o del de `ALL_STATUS_OPTIONS`
// (pensado para un `<select>`, no para una fila de indicadores).
const STATS_ORDER: RemateStatus[] = ['live', 'paused', 'scheduled', 'draft', 'finished', 'cancelled'];

/**
 * Fila de indicadores del dashboard -- pedido explícito de este módulo: "apariencia de
 * consola profesional", sin tablas. Se calcula client-side sobre la misma lista ya
 * cargada por `useRemates` (`RematadorDashboardPage`), sin ningún endpoint nuevo.
 *
 * Rediseño visual (Épica 9, Etapa 5): usa `DashboardStatCard` (local a `rematador/`,
 * no el `StatCard` compartido) para un look tipo Stripe/Vercel/Linear -- ícono por
 * estado, tarjeta más grande, sin la flecha de tendencia que sí tiene sentido en series
 * temporales (Analítica) pero no en un conteo puntual por categoría.
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
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
      <DashboardStatCard
        label="Total"
        formattedValue={String(remates.length)}
        icon={Gavel}
        toneClassName="bg-slate-900 text-white"
      />
      {STATS_ORDER.map((status) => (
        <DashboardStatCard
          key={status}
          label={STATUS_LABELS[status]}
          formattedValue={String(counts[status])}
          icon={ICONS[status]}
          toneClassName={TONE_CLASSES[status]}
          pulse={status === 'live' && counts[status] > 0}
        />
      ))}
    </div>
  );
}
