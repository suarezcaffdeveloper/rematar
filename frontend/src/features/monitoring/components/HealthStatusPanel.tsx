import { Badge } from '../../../shared/components/Badge';
import { Card } from '../../../shared/components/Card';
import type { HealthCheckResponse, HealthStatus } from '../types';

export interface HealthStatusPanelProps {
  health: HealthCheckResponse;
}

const COMPONENT_LABELS: Record<string, string> = {
  api: 'API',
  postgres: 'PostgreSQL',
  redis: 'Redis',
  websocket: 'WebSocket',
};

const STATUS_VARIANTS: Record<HealthStatus, 'success' | 'warning' | 'danger'> = {
  ok: 'success',
  degraded: 'warning',
  unavailable: 'danger',
};

const STATUS_LABELS: Record<HealthStatus, string> = {
  ok: 'OK',
  degraded: 'Degradado',
  unavailable: 'No disponible',
};

/** Estado de salud de la plataforma (Épica 8, Módulo 8.1): una tarjeta por componente
 * (API/PostgreSQL/Redis/WebSocket), badge de color -- nunca solo color, siempre con
 * texto (mismo criterio de accesibilidad que `KpiCard`). */
export function HealthStatusPanel({ health }: HealthStatusPanelProps) {
  return (
    <Card>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-800">Estado de la plataforma</h3>
        <Badge variant={STATUS_VARIANTS[health.status]}>{STATUS_LABELS[health.status]}</Badge>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {health.checks.map((check) => (
          <div key={check.component} className="flex flex-col gap-1 rounded-lg border border-slate-100 p-2">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {COMPONENT_LABELS[check.component] ?? check.component}
            </span>
            <Badge variant={STATUS_VARIANTS[check.status]}>{STATUS_LABELS[check.status]}</Badge>
            {check.detail && <span className="text-xs text-slate-400">{check.detail}</span>}
          </div>
        ))}
      </div>
    </Card>
  );
}
