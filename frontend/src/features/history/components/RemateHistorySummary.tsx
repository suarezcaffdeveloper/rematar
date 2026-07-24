import { StatCard } from '../../../shared/components/StatCard';
import { formatCurrency, formatDuration } from '../../../shared/lib/format';
import type { RemateHistoryDetail } from '../types';

export interface RemateHistorySummaryProps {
  detail: RemateHistoryDetail;
  currency: string;
}

/**
 * Tarjetas KPI del detalle de historial (Épica 7, Módulo 7.3) -- reutiliza `StatCard`
 * (`shared/components/`, Épica 9 Etapa 3) tal cual, sin duplicarlo: son las mismas
 * "métricas finales" que el panel en vivo de Analítica (Módulo 7.1) ya mostraba
 * mientras el remate estaba en curso, congeladas ahora que terminó (`showTrend` queda
 * en `false`, su default, en todas -- un valor final no "sube" ni "baja", ya no cambia).
 */
export function RemateHistorySummary({ detail, currency }: RemateHistorySummaryProps) {
  const lotesRestantes = detail.lote_status_counts.pending + detail.lote_status_counts.open;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <StatCard
        label="Lotes vendidos"
        value={detail.lote_status_counts.closed_sold}
        formattedValue={`${detail.lote_status_counts.closed_sold}/${detail.lote_status_counts.total}`}
        showTrend={false}
      />
      <StatCard
        label="Total de ofertas"
        value={detail.total_ofertas}
        formattedValue={String(detail.total_ofertas)}
        showTrend={false}
      />
      <StatCard
        label="Valor total adjudicado"
        value={Number(detail.total_awarded_value)}
        formattedValue={formatCurrency(detail.total_awarded_value, currency)}
        showTrend={false}
      />
      <StatCard
        label="Participantes"
        value={detail.participants_count}
        formattedValue={String(detail.participants_count)}
        showTrend={false}
      />
      <StatCard
        label="Duración total"
        value={detail.duration_seconds ?? 0}
        formattedValue={detail.duration_seconds != null ? formatDuration(detail.duration_seconds * 1000) : '—'}
        showTrend={false}
      />
      <StatCard
        label="Tiempo promedio por lote"
        value={detail.average_lote_duration_seconds ?? 0}
        formattedValue={
          detail.average_lote_duration_seconds != null
            ? formatDuration(detail.average_lote_duration_seconds * 1000)
            : '—'
        }
        showTrend={false}
      />
      <StatCard
        label="Lotes restantes sin resolver"
        value={lotesRestantes}
        formattedValue={String(lotesRestantes)}
        showTrend={false}
      />
      <StatCard
        label="Oferta más alta"
        value={detail.highest_oferta ? Number(detail.highest_oferta.amount) : 0}
        formattedValue={
          detail.highest_oferta ? formatCurrency(detail.highest_oferta.amount, currency) : '—'
        }
        showTrend={false}
      />
    </div>
  );
}
