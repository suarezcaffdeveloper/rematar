/**
 * Llamadas HTTP del feature de monitoreo (Épica 8, Módulo 8.1). Ver
 * docs/38-observabilidad-y-monitoreo.md.
 */

import { apiClient } from '../../shared/api/client';
import type { HealthCheckResponse, PlatformMetrics } from './types';

export async function fetchPlatformHealthRequest(): Promise<HealthCheckResponse> {
  const { data } = await apiClient.get<HealthCheckResponse>('/monitoring/health');
  return data;
}

export async function fetchPlatformMetricsRequest(): Promise<PlatformMetrics> {
  const { data } = await apiClient.get<PlatformMetrics>('/monitoring/metrics');
  return data;
}
