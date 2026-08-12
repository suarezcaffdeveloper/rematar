import { StatCard } from '../../../shared/components/StatCard';
import { formatCurrency, formatDuration } from '../../../shared/lib/format';
import type { RemateHistoryDetail } from '../types';

export interface RemateHistorySecondaryStatsProps {
  detail: RemateHistoryDetail;
  currency: string;
}

/** KPIs secundarios -- complementan a `RemateHistoryPrimaryStats` con menos jerarquía
 * visual (más cards por fila): oferta más alta, tiempos, y la actividad del chat --
 * esto último absorbe lo que antes era `ChatActivityCard` (un `Card` propio con 3
 * números), ahora 3 `StatCard` secundarios más, sin componente aparte. `centered`, sin
 * color: mismo criterio visual que `RemateHistoryPrimaryStats`. */
export function RemateHistorySecondaryStats({ detail, currency }: RemateHistorySecondaryStatsProps) {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold text-slate-900">Rendimiento</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard
          centered
          label="Oferta más alta"
          value={detail.highest_oferta ? Number(detail.highest_oferta.amount) : 0}
          formattedValue={detail.highest_oferta ? formatCurrency(detail.highest_oferta.amount, currency) : '—'}
          showTrend={false}
        />
        <StatCard
          centered
          label="Duración total"
          value={detail.duration_seconds ?? 0}
          formattedValue={detail.duration_seconds != null ? formatDuration(detail.duration_seconds * 1000) : '—'}
          showTrend={false}
        />
        <StatCard
          centered
          label="Tiempo prom. por lote"
          value={detail.average_lote_duration_seconds ?? 0}
          formattedValue={
            detail.average_lote_duration_seconds != null
              ? formatDuration(detail.average_lote_duration_seconds * 1000)
              : '—'
          }
          showTrend={false}
        />
        <StatCard
          centered
          label="Mensajes de chat"
          value={detail.chat_activity.message_count}
          formattedValue={String(detail.chat_activity.message_count)}
          showTrend={false}
        />
        <StatCard
          centered
          label="Participantes del chat"
          value={detail.chat_activity.participant_count}
          formattedValue={String(detail.chat_activity.participant_count)}
          showTrend={false}
        />
        <StatCard
          centered
          label="Mensajes moderados"
          value={detail.chat_activity.deleted_count}
          formattedValue={String(detail.chat_activity.deleted_count)}
          showTrend={false}
        />
      </div>
    </div>
  );
}
