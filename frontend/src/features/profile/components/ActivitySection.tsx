import { StatCard } from '../../../shared/components/StatCard';
import { formatCurrency } from '../../../shared/lib/format';
import type { BuyerActivityStats } from '../mockActivity';

export interface ActivitySectionProps {
  stats: BuyerActivityStats;
}

/**
 * Sección "Mi actividad" -- resumen mínimo (pedido explícito de diseño: "no un
 * dashboard"), solo cuatro indicadores, sin gráficos ni tendencias. Reutiliza
 * `StatCard` en su variante `centered` (grilla densa de KPIs, ya usada en el informe
 * ejecutivo de Historial) en vez de inventar una tarjeta nueva -- misma pieza visual,
 * `showTrend={false}` porque estos son totales acumulados, no una métrica que tenga
 * sentido comparar contra "el valor anterior".
 */
export function ActivitySection({ stats }: ActivitySectionProps) {
  return (
    <section>
      <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Mi actividad</h2>
      <p className="mt-1 text-sm text-slate-500">Resumen de tu participación en RematAR.</p>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          centered
          showTrend={false}
          label="Remates participados"
          value={stats.rematesParticipados}
          formattedValue={String(stats.rematesParticipados)}
        />
        <StatCard
          centered
          showTrend={false}
          label="Ofertas realizadas"
          value={stats.ofertasRealizadas}
          formattedValue={String(stats.ofertasRealizadas)}
        />
        <StatCard
          centered
          showTrend={false}
          label="Lotes adjudicados"
          value={stats.lotesAdjudicados}
          formattedValue={String(stats.lotesAdjudicados)}
        />
        <StatCard
          centered
          showTrend={false}
          label="Total adjudicado"
          value={Number(stats.totalAdjudicado)}
          formattedValue={formatCurrency(stats.totalAdjudicado, stats.currency)}
        />
      </div>
    </section>
  );
}
