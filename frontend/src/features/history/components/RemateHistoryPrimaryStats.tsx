import { StatCard } from '../../../shared/components/StatCard';
import { formatCurrency } from '../../../shared/lib/format';
import type { RemateHistoryDetail } from '../types';

export interface RemateHistoryPrimaryStatsProps {
  detail: RemateHistoryDetail;
  currency: string;
}

/** Los 5 KPIs principales del informe ejecutivo -- primera fila, la que se escanea de
 * un vistazo. `showTrend={false}` en todas: son valores finales, congelados, "más" no
 * significa "mejor" acá (mismo criterio que la vieja `RemateHistorySummary`, que este
 * componente reemplaza junto con `RemateHistorySecondaryStats`). `centered`, sin
 * `accentClassName`: cards neutras (sin color), contenido centrado, mismo criterio
 * visual que `RemateHistorySecondaryStats` y `RemateAnalysisSection`. */
export function RemateHistoryPrimaryStats({ detail, currency }: RemateHistoryPrimaryStatsProps) {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold text-ink">Resumen ejecutivo</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard
          centered
          tone="ink"
          label="Valor total adjudicado"
          value={Number(detail.total_awarded_value)}
          formattedValue={formatCurrency(detail.total_awarded_value, currency)}
          showTrend={false}
        />
        <StatCard
          centered
          tone="ink"
          label="Lotes vendidos"
          value={detail.lote_status_counts.closed_sold}
          formattedValue={`${detail.lote_status_counts.closed_sold}/${detail.lote_status_counts.total}`}
          showTrend={false}
        />
        <StatCard
          centered
          tone="ink"
          label="Total de lotes"
          value={detail.lote_status_counts.total}
          formattedValue={String(detail.lote_status_counts.total)}
          showTrend={false}
        />
        <StatCard
          centered
          tone="ink"
          label="Participantes"
          value={detail.participants_count}
          formattedValue={String(detail.participants_count)}
          showTrend={false}
        />
        <StatCard
          centered
          tone="ink"
          label="Total de ofertas"
          value={detail.total_ofertas}
          formattedValue={String(detail.total_ofertas)}
          showTrend={false}
        />
      </div>
    </div>
  );
}
