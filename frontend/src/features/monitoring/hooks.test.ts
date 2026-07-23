import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { HealthCheckResponse, PlatformMetrics } from './types';

const apiMocks = vi.hoisted(() => ({
  fetchPlatformHealthRequest: vi.fn(),
  fetchPlatformMetricsRequest: vi.fn(),
}));

vi.mock('./api', () => apiMocks);

const { usePlatformMonitoring } = await import('./hooks');

function makeHealth(overrides: Partial<HealthCheckResponse> = {}): HealthCheckResponse {
  return {
    status: 'ok',
    checks: [
      { component: 'api', status: 'ok', detail: null },
      { component: 'postgres', status: 'ok', detail: null },
      { component: 'redis', status: 'ok', detail: null },
      { component: 'websocket', status: 'ok', detail: '3 conexiones activas' },
    ],
    generated_at: '2026-07-22T00:00:00Z',
    ...overrides,
  };
}

function makeMetrics(overrides: Partial<PlatformMetrics> = {}): PlatformMetrics {
  return {
    connected_users: 3,
    active_websockets: 4,
    chat_messages_per_minute: 2,
    ofertas_per_minute: 1,
    avg_oferta_processing_ms: 12.5,
    avg_api_response_ms: 45.0,
    errors_last_minute: 0,
    memory_usage_mb: 128.3,
    cpu_usage_percent: 5.2,
    generated_at: '2026-07-22T00:00:00Z',
    ...overrides,
  };
}

describe('usePlatformMonitoring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.fetchPlatformHealthRequest.mockResolvedValue(makeHealth());
    apiMocks.fetchPlatformMetricsRequest.mockResolvedValue(makeMetrics());
  });

  it('hace un fetch al montar y expone health + metrics', async () => {
    const { result } = renderHook(() => usePlatformMonitoring(10_000));

    expect(result.current.isInitialLoading).toBe(true);
    await waitFor(() => expect(result.current.isInitialLoading).toBe(false));

    expect(result.current.health?.status).toBe('ok');
    expect(result.current.metrics?.connected_users).toBe(3);
    expect(apiMocks.fetchPlatformHealthRequest).toHaveBeenCalledTimes(1);
    expect(apiMocks.fetchPlatformMetricsRequest).toHaveBeenCalledTimes(1);
  });

  it('refetchea automáticamente cada `intervalMs`', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => usePlatformMonitoring(10_000));
    await vi.waitFor(() => expect(result.current.isInitialLoading).toBe(false));

    apiMocks.fetchPlatformHealthRequest.mockClear();
    apiMocks.fetchPlatformMetricsRequest.mockClear();

    await act(async () => {
      vi.advanceTimersByTime(10_000);
    });

    expect(apiMocks.fetchPlatformHealthRequest).toHaveBeenCalledTimes(1);
    expect(apiMocks.fetchPlatformMetricsRequest).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it('desmontar detiene el polling (no hay más fetches tras el unmount)', async () => {
    vi.useFakeTimers();
    const { result, unmount } = renderHook(() => usePlatformMonitoring(10_000));
    await vi.waitFor(() => expect(result.current.isInitialLoading).toBe(false));

    apiMocks.fetchPlatformHealthRequest.mockClear();
    unmount();

    await act(async () => {
      vi.advanceTimersByTime(30_000);
    });

    expect(apiMocks.fetchPlatformHealthRequest).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  it('un error en el fetch inicial se expone en error', async () => {
    apiMocks.fetchPlatformHealthRequest.mockRejectedValue({
      isAxiosError: true,
      response: { status: 500, data: { error: { code: 'internal_error', message: 'Falla interna.' } } },
    });

    const { result } = renderHook(() => usePlatformMonitoring(10_000));
    await waitFor(() => expect(result.current.isInitialLoading).toBe(false));

    expect(result.current.error?.message).toBe('Falla interna.');
    expect(result.current.health).toBeNull();
  });

  it('un refetch de fondo que falla mantiene el último dato bueno', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => usePlatformMonitoring(10_000));
    await vi.waitFor(() => expect(result.current.isInitialLoading).toBe(false));
    expect(result.current.metrics?.connected_users).toBe(3);

    apiMocks.fetchPlatformMetricsRequest.mockRejectedValueOnce(new Error('network error'));

    await act(async () => {
      vi.advanceTimersByTime(10_000);
    });

    expect(result.current.metrics?.connected_users).toBe(3);
    expect(result.current.error).toBeNull();

    vi.useRealTimers();
  });
});
