import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { RemateAnalyticsSnapshot } from './types';

const apiMocks = vi.hoisted(() => ({
  fetchRemateAnalyticsRequest: vi.fn(),
}));

vi.mock('./api', () => apiMocks);

const { useRemateAnalytics } = await import('./hooks');

function makeSnapshot(overrides: Partial<RemateAnalyticsSnapshot> = {}): RemateAnalyticsSnapshot {
  return {
    schema_version: 1,
    remate_id: 'remate-1',
    connected_users_total: 3,
    connected_buyers: 2,
    lote_status_counts: { pending: 1, open: 1, closed_sold: 1, closed_unsold: 0, cancelled: 0, total: 3 },
    average_lote_duration_seconds: 120,
    total_awarded_value: '5000.00',
    total_ofertas: 4,
    ofertas_per_minute: 1,
    highest_oferta: null,
    top_lote_by_offers: null,
    bids_timeline: [],
    recent_events: [],
    generated_at: '2026-07-21T00:00:00Z',
    ...overrides,
  };
}

/** Emula `subscribeToRealtime` (`useLiveRemateState`) -- guarda el listener para poder
 * emitir mensajes a mano desde cada test, mismo patrón que `features/chat/hooks.test.ts`. */
function makeRealtimeStub() {
  const listeners: Array<(message: unknown) => void> = [];
  const subscribeToRealtime = vi.fn((listener: (message: unknown) => void) => {
    listeners.push(listener);
    return () => {
      const index = listeners.indexOf(listener);
      if (index !== -1) listeners.splice(index, 1);
    };
  });
  return {
    subscribeToRealtime,
    emit: (message: unknown) => listeners.forEach((listener) => listener(message)),
  };
}

function domainEvent(eventType: string) {
  return { type: 'domain_event', event_type: eventType, payload: {} };
}

describe('useRemateAnalytics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.fetchRemateAnalyticsRequest.mockResolvedValue(makeSnapshot());
  });

  it('hace un único fetch al montar y expone el resultado', async () => {
    const { subscribeToRealtime } = makeRealtimeStub();
    const { result } = renderHook(() => useRemateAnalytics('remate-1', subscribeToRealtime));

    expect(result.current.isInitialLoading).toBe(true);
    await waitFor(() => expect(result.current.isInitialLoading).toBe(false));

    expect(result.current.data?.total_ofertas).toBe(4);
    expect(result.current.initialError).toBeNull();
    expect(apiMocks.fetchRemateAnalyticsRequest).toHaveBeenCalledTimes(1);
    expect(apiMocks.fetchRemateAnalyticsRequest).toHaveBeenCalledWith('remate-1');
  });

  it('un error en el fetch inicial se expone en initialError', async () => {
    apiMocks.fetchRemateAnalyticsRequest.mockRejectedValue({
      isAxiosError: true,
      response: { status: 403, data: { error: { code: 'forbidden', message: 'No tenés acceso.' } } },
    });
    const { subscribeToRealtime } = makeRealtimeStub();
    const { result } = renderHook(() => useRemateAnalytics('remate-1', subscribeToRealtime));

    await waitFor(() => expect(result.current.isInitialLoading).toBe(false));
    expect(result.current.initialError?.message).toBe('No tenés acceso.');
    expect(result.current.data).toBeNull();
  });

  it('una ráfaga de eventos relevantes colapsa en un único refetch tras el debounce', async () => {
    vi.useFakeTimers();
    const { subscribeToRealtime, emit } = makeRealtimeStub();
    const { result } = renderHook(() => useRemateAnalytics('remate-1', subscribeToRealtime));
    await vi.waitFor(() => expect(result.current.isInitialLoading).toBe(false));

    apiMocks.fetchRemateAnalyticsRequest.mockClear();

    act(() => {
      emit(domainEvent('oferta.placed'));
      emit(domainEvent('oferta.accepted'));
      emit(domainEvent('lote.closed'));
    });

    expect(apiMocks.fetchRemateAnalyticsRequest).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1199);
    });
    expect(apiMocks.fetchRemateAnalyticsRequest).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(apiMocks.fetchRemateAnalyticsRequest).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it('ignora eventos que no son señal de refetch (ej. chat.message_sent)', async () => {
    vi.useFakeTimers();
    const { subscribeToRealtime, emit } = makeRealtimeStub();
    const { result } = renderHook(() => useRemateAnalytics('remate-1', subscribeToRealtime));
    await vi.waitFor(() => expect(result.current.isInitialLoading).toBe(false));

    apiMocks.fetchRemateAnalyticsRequest.mockClear();

    act(() => {
      emit(domainEvent('chat.message_sent'));
      emit(domainEvent('presencia.usuario_conectado')); // este sí dispara
    });

    await act(async () => {
      vi.advanceTimersByTime(1200);
    });
    expect(apiMocks.fetchRemateAnalyticsRequest).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it('un mensaje de tipo snapshot también dispara el refetch debounced', async () => {
    vi.useFakeTimers();
    const { subscribeToRealtime, emit } = makeRealtimeStub();
    const { result } = renderHook(() => useRemateAnalytics('remate-1', subscribeToRealtime));
    await vi.waitFor(() => expect(result.current.isInitialLoading).toBe(false));

    apiMocks.fetchRemateAnalyticsRequest.mockClear();

    act(() => {
      emit({ type: 'snapshot', data: {} });
    });

    await act(async () => {
      vi.advanceTimersByTime(1200);
    });
    expect(apiMocks.fetchRemateAnalyticsRequest).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it('un refetch de fondo que falla mantiene el último dato bueno y no toca initialError', async () => {
    vi.useFakeTimers();
    const { subscribeToRealtime, emit } = makeRealtimeStub();
    const { result } = renderHook(() => useRemateAnalytics('remate-1', subscribeToRealtime));
    await vi.waitFor(() => expect(result.current.isInitialLoading).toBe(false));
    expect(result.current.data?.total_ofertas).toBe(4);

    apiMocks.fetchRemateAnalyticsRequest.mockClear();
    apiMocks.fetchRemateAnalyticsRequest.mockRejectedValueOnce(new Error('network error'));

    act(() => {
      emit(domainEvent('oferta.placed'));
    });

    await act(async () => {
      vi.advanceTimersByTime(1200);
    });
    await vi.waitFor(() => expect(apiMocks.fetchRemateAnalyticsRequest).toHaveBeenCalledTimes(1));

    expect(result.current.data?.total_ofertas).toBe(4);
    expect(result.current.initialError).toBeNull();

    vi.useRealTimers();
  });

  it('desmontar antes de que dispare el debounce no ejecuta el refetch pendiente', async () => {
    vi.useFakeTimers();
    const { subscribeToRealtime, emit } = makeRealtimeStub();
    const { result, unmount } = renderHook(() => useRemateAnalytics('remate-1', subscribeToRealtime));
    await vi.waitFor(() => expect(result.current.isInitialLoading).toBe(false));

    apiMocks.fetchRemateAnalyticsRequest.mockClear();

    act(() => {
      emit(domainEvent('oferta.placed'));
    });
    unmount();

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    expect(apiMocks.fetchRemateAnalyticsRequest).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  it('cambiar remateId cancela el debounce pendiente y dispara un fetch inicial nuevo', async () => {
    vi.useFakeTimers();
    const { subscribeToRealtime, emit } = makeRealtimeStub();
    const { result, rerender } = renderHook(
      ({ remateId }) => useRemateAnalytics(remateId, subscribeToRealtime),
      { initialProps: { remateId: 'remate-1' } },
    );
    await vi.waitFor(() => expect(result.current.isInitialLoading).toBe(false));

    apiMocks.fetchRemateAnalyticsRequest.mockClear();
    apiMocks.fetchRemateAnalyticsRequest.mockResolvedValue(makeSnapshot({ remate_id: 'remate-2' }));

    act(() => {
      emit(domainEvent('oferta.placed')); // arranca un debounce para remate-1
    });
    rerender({ remateId: 'remate-2' });

    // El fetch inicial de remate-2 sale de inmediato (no espera el debounce).
    await vi.waitFor(() =>
      expect(apiMocks.fetchRemateAnalyticsRequest).toHaveBeenCalledWith('remate-2'),
    );

    apiMocks.fetchRemateAnalyticsRequest.mockClear();
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    // El debounce viejo (remate-1) no debería haber sobrevivido al cambio de id.
    expect(apiMocks.fetchRemateAnalyticsRequest).not.toHaveBeenCalled();

    vi.useRealTimers();
  });
});
