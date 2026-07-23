import { KpiCard } from '../../analytics/components/KpiCard';
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
 * `KpiCard` de `features/analytics/components/` tal cual, sin duplicarlo. `showTrend`
 * queda en `false` para las métricas donde "más" no es "mejor" (tiempos de respuesta,
 * errores, uso de recursos) -- `KpiCard` pinta la flecha "arriba" siempre en verde, lo
 * cual sería engañoso ahí (ver `AnalyticsPanel`, mismo criterio ya establecido para
 * "tiempo promedio por lote").
 */
export function MetricsGrid({ metrics }: MetricsGridProps) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <KpiCard
        label="Usuarios conectados"
        value={metrics.connected_users}
        formattedValue={String(metrics.connected_users)}
      />
      <KpiCard
        label="WebSockets activos"
        value={metrics.active_websockets}
        formattedValue={String(metrics.active_websockets)}
      />
      <KpiCard
        label="Mensajes de chat / min"
        value={metrics.chat_messages_per_minute}
        formattedValue={String(metrics.chat_messages_per_minute)}
      />
      <KpiCard
        label="Ofertas / min"
        value={metrics.ofertas_per_minute}
        formattedValue={String(metrics.ofertas_per_minute)}
      />
      <KpiCard
        label="Tiempo prom. de una oferta"
        value={metrics.avg_oferta_processing_ms ?? 0}
        formattedValue={formatMs(metrics.avg_oferta_processing_ms)}
        showTrend={false}
      />
      <KpiCard
        label="Tiempo de respuesta API"
        value={metrics.avg_api_response_ms ?? 0}
        formattedValue={formatMs(metrics.avg_api_response_ms)}
        showTrend={false}
      />
      <KpiCard
        label="Errores recientes"
        value={metrics.errors_last_minute}
        formattedValue={String(metrics.errors_last_minute)}
        showTrend={false}
      />
      <KpiCard
        label="Memoria (proceso)"
        value={metrics.memory_usage_mb ?? 0}
        formattedValue={formatMb(metrics.memory_usage_mb)}
        showTrend={false}
      />
      <KpiCard
        label="CPU (proceso)"
        value={metrics.cpu_usage_percent ?? 0}
        formattedValue={formatPercent(metrics.cpu_usage_percent)}
        showTrend={false}
      />
    </div>
  );
}
