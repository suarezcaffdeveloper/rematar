/**
 * Tipos que reflejan `backend/app/monitoring/schemas.py` (Épica 8, Módulo 8.1). Ver
 * docs/38-observabilidad-y-monitoreo.md.
 */

export type HealthStatus = 'ok' | 'degraded' | 'unavailable';

export interface HealthCheckResult {
  component: 'api' | 'postgres' | 'redis' | 'websocket';
  status: HealthStatus;
  detail: string | null;
}

export interface HealthCheckResponse {
  status: HealthStatus;
  checks: HealthCheckResult[];
  generated_at: string;
}

export interface PlatformMetrics {
  connected_users: number;
  active_websockets: number;
  chat_messages_per_minute: number;
  ofertas_per_minute: number;
  avg_oferta_processing_ms: number | null;
  avg_api_response_ms: number | null;
  errors_last_minute: number;
  memory_usage_mb: number | null;
  cpu_usage_percent: number | null;
  generated_at: string;
}
