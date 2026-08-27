import { useEffect, useMemo, useRef, useState } from 'react';
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
 * Franja de indicadores del dashboard -- pedido explícito de este módulo: "apariencia de
 * consola profesional", sin tablas. Se calcula client-side sobre la misma lista ya
 * cargada por `useRemates` (`RematadorDashboardPage`), sin ningún endpoint nuevo.
 *
 * Retexturizado en la Épica 9, Etapa 9 (ver prototipo aprobado): antes eran 7 tarjetas
 * sueltas, cada una con su propio borde+sombra+esquinas redondeadas -- exactamente el
 * patrón de "más cards" que el rediseño pidió evitar. Ahora es una única franja abierta
 * (un solo `border`/`rounded-xl` para todo el conjunto) con `DashboardStatCard` como
 * celdas separadas por hairlines (`divide-x`/`divide-y`), mismo espíritu que una barra de
 * métricas tipo Linear/Vercel. Fila sin wrap (`flex` + `overflow-x-auto`, no `grid`): con
 * `divide-x` un grid que wrappea deja una línea vertical de más en el primer ítem de cada
 * fila nueva -- en mobile la franja scrollea horizontal en vez de wrappear, así los
 * hairlines quedan siempre prolijos. Sin `justify-center` (se sacó a propósito): con el
 * contenido desbordado, centrarlo deja scrollLeft=0 apuntando al medio de la tira -- la
 * primera celda arranca cortada, sin forma de volver atrás. El degradé del borde derecho
 * (`canScrollRight`) es el único indicio de que hay más celdas para descubrir scrolleando.
 */
export function RematadorDashboardStats({ remates }: RematadorDashboardStatsProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollRight, setCanScrollRight] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const updateFade = () => {
      setCanScrollRight(el.scrollWidth - el.clientWidth - el.scrollLeft > 4);
    };
    updateFade();
    el.addEventListener('scroll', updateFade, { passive: true });
    window.addEventListener('resize', updateFade);
    return () => {
      el.removeEventListener('scroll', updateFade);
      window.removeEventListener('resize', updateFade);
    };
  }, [remates]);

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
    <div className="relative">
      <div
        ref={scrollRef}
        className="flex divide-x divide-line overflow-x-auto rounded-xl border border-line"
      >
        <DashboardStatCard
          label="Total"
          formattedValue={String(remates.length)}
          icon={Gavel}
          toneClassName="bg-ink text-white"
          className="shrink-0"
        />
        {STATS_ORDER.map((status) => (
          <DashboardStatCard
            key={status}
            label={STATUS_LABELS[status]}
            formattedValue={String(counts[status])}
            icon={ICONS[status]}
            toneClassName={TONE_CLASSES[status]}
            pulse={status === 'live' && counts[status] > 0}
            className="shrink-0"
          />
        ))}
      </div>
      {canScrollRight && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 w-10 rounded-r-xl bg-gradient-to-l from-white to-transparent"
        />
      )}
    </div>
  );
}
