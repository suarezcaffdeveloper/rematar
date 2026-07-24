import { StatCard } from '../../../shared/components/StatCard';
import type { PlatformMetrics } from '../types';

export interface MetricsGridProps {
  metrics: PlatformMetrics;
}

function formatMs(value: number | null): string {
  return value != null ? `${value.toFixed(0)} ms` : '—';
}

function formatPercent(value: number | null): string {
  return value != null ? `${value.toFixed(1)}%` : '—';
}

function formatMb(value: number | null): string {
  return value != null ? `${value.toFixed(0)} MB` : '—';
}

/**
 * Tarjetas KPI de métricas de la plataforma (Épica 8, Módulo 8.1) -- reutiliza
 * `StatCard` de `shared/components/` (Épica 9, Etapa 3: unifica lo que antes era
 * `KpiCard`/`StatChip`, dos componentes casi idénticos). `showTrend={false}` explícito
 * en las métricas donde "más" no es "mejor" (tiempos de respuesta, errores, uso de
 * recursos) -- mostrar la flecha "arriba" siempre en verde ahí sería engañoso (ver
 * `AnalyticsPanel`, mismo criterio ya establecido para "tiempo promedio por lote").
 */
export function MetricsGrid({ metrics }: MetricsGridProps) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <StatCard
        label="Usuarios conectados"
        value={metrics.connected_users}
        formattedValue={String(metrics.connected_users)}
      />
      <StatCard
        label="WebSockets activos"
        value={metrics.active_websockets}
        formattedValue={String(metrics.active_websockets)}
      />
      <StatCard
        label="Mensajes de chat / min"
        value={metrics.chat_messages_per_minute}
        formattedValue={String(metrics.chat_messages_per_minute)}
      />
      <StatCard
        label="Ofertas / min"
        value={metrics.ofertas_per_minute}
        formattedValue={String(metrics.ofertas_per_minute)}
      />
      <StatCard
        label="Tiempo prom. de una oferta"
        value={metrics.avg_oferta_processing_ms ?? 0}
        formattedValue={formatMs(metrics.avg_oferta_processing_ms)}
        showTrend={false}
      />
      <StatCard
        label="Tiempo de respuesta API"
        value={metrics.avg_api_response_ms ?? 0}
        formattedValue={formatMs(metrics.avg_api_response_ms)}
        showTrend={false}
      />
      <StatCard
        label="Errores recientes"
        value={metrics.errors_last_minute}
        formattedValue={String(metrics.errors_last_minute)}
        showTrend={false}
      />
      <StatCard
        label="Memoria (proceso)"
        value={metrics.memory_usage_mb ?? 0}
        formattedValue={formatMb(metrics.memory_usage_mb)}
        showTrend={false}
      />
      <StatCard
        label="CPU (proceso)"
        value={metrics.cpu_usage_percent ?? 0}
        formattedValue={formatPercent(metrics.cpu_usage_percent)}
        showTrend={false}
      />
    </div>
  );
}
