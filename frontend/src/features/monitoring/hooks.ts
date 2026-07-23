/**
 * Hook del feature de monitoreo (Épica 8, Módulo 8.1). Polling simple (`setInterval`),
 * no WebSocket: son snapshots periódicos del estado de la plataforma, no eventos de
 * dominio a los que reaccionar -- "actualizar automáticamente cuando sea posible" se
 * resuelve con un refetch cada `intervalMs` mientras el componente está montado. Al
 * cambiar de pestaña en `/admin`, este componente se desmonta y el intervalo se
 * limpia solo (cleanup de `useEffect`), sin un mecanismo especial de pausa.
 */

import { useEffect, useState } from 'react';
import { normalizeApiError, type NormalizedApiError } from '../../shared/api/errors';
import { fetchPlatformHealthRequest, fetchPlatformMetricsRequest } from './api';
import type { HealthCheckResponse, PlatformMetrics } from './types';

const DEFAULT_INTERVAL_MS = 10_000;

export interface UsePlatformMonitoringResult {
  health: HealthCheckResponse | null;
  metrics: PlatformMetrics | null;
  isInitialLoading: boolean;
  error: NormalizedApiError | null;
}

export function usePlatformMonitoring(
  intervalMs: number = DEFAULT_INTERVAL_MS,
): UsePlatformMonitoringResult {
  const [health, setHealth] = useState<HealthCheckResponse | null>(null);
  const [metrics, setMetrics] = useState<PlatformMetrics | null>(null);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [error, setError] = useState<NormalizedApiError | null>(null);

  useEffect(() => {
    let cancelled = false;
    let hasLoadedOnce = false;

    async function fetchNow() {
      try {
        const [healthResult, metricsResult] = await Promise.all([
          fetchPlatformHealthRequest(),
          fetchPlatformMetricsRequest(),
        ]);
        if (cancelled) return;
        setHealth(healthResult);
        setMetrics(metricsResult);
        setError(null);
      } catch (err) {
        if (!cancelled && !hasLoadedOnce) {
          setError(normalizeApiError(err));
        }
      } finally {
        if (!cancelled) {
          hasLoadedOnce = true;
          setIsInitialLoading(false);
        }
      }
    }

    void fetchNow();
    const timer = setInterval(() => void fetchNow(), intervalMs);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [intervalMs]);

  return { health, metrics, isInitialLoading, error };
}
