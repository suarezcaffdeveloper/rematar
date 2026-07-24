import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { Remate, RemateStatus } from '../remates/types';

const rematesApiMocks = vi.hoisted(() => ({
  fetchLotesRequest: vi.fn(),
}));
const salaApiMocks = vi.hoisted(() => ({
  fetchRemateSnapshotRequest: vi.fn(),
}));

vi.mock('../remates/api', () => rematesApiMocks);
vi.mock('../sala/api', () => salaApiMocks);

const { useRemateOperationalInfo, useElapsedTime, useLiveOperationalSummary } = await import('./hooks');

function lote(id: string, status: 'pending' | 'open' | 'closed_sold' | 'closed_unsold' | 'cancelled') {
  return { id, title: `Lote ${id}`, status };
}

describe('useRemateOperationalInfo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    salaApiMocks.fetchRemateSnapshotRequest.mockResolvedValue({ connected_users: 0 });
  });

  it('expone la cantidad total de lotes y el lote activo/próximo', async () => {
    rematesApiMocks.fetchLotesRequest.mockResolvedValue({
      items: [lote('a', 'closed_sold'), lote('b', 'open'), lote('c', 'pending'), lote('d', 'pending')],
      total: 4,
      page: 1,
      page_size: 50,
    });

    const { result } = renderHook(() => useRemateOperationalInfo('remate-1', 'live'));

    expect(result.current.isLoadingLotes).toBe(true);
    await waitFor(() => expect(result.current.isLoadingLotes).toBe(false));

    expect(result.current.loteCount).toBe(4);
    expect(result.current.activeLote?.id).toBe('b');
    expect(result.current.nextLote?.id).toBe('c');
  });

  it('sin lote open ni pending, activeLote/nextLote quedan en null', async () => {
    rematesApiMocks.fetchLotesRequest.mockResolvedValue({
      items: [lote('a', 'closed_sold')],
      total: 1,
      page: 1,
      page_size: 50,
    });

    const { result } = renderHook(() => useRemateOperationalInfo('remate-1', 'finished'));

    await waitFor(() => expect(result.current.isLoadingLotes).toBe(false));
    expect(result.current.activeLote).toBeNull();
    expect(result.current.nextLote).toBeNull();
  });

  it('ante un error de lotes, no rompe -- todo vuelve a null', async () => {
    rematesApiMocks.fetchLotesRequest.mockRejectedValue(new Error('falló'));

    const { result } = renderHook(() => useRemateOperationalInfo('remate-1', 'live'));

    await waitFor(() => expect(result.current.isLoadingLotes).toBe(false));
    expect(result.current.loteCount).toBeNull();
    expect(result.current.activeLote).toBeNull();
    expect(result.current.nextLote).toBeNull();
  });

  it('pide el snapshot (conectados) solo si el remate está "live" o "paused"', async () => {
    rematesApiMocks.fetchLotesRequest.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 50 });
    salaApiMocks.fetchRemateSnapshotRequest.mockResolvedValue({ connected_users: 7 });

    const { result, rerender } = renderHook<ReturnType<typeof useRemateOperationalInfo>, { status: RemateStatus }>(
      ({ status }) => useRemateOperationalInfo('remate-1', status),
      { initialProps: { status: 'scheduled' } },
    );

    await waitFor(() => expect(result.current.isLoadingLotes).toBe(false));
    expect(salaApiMocks.fetchRemateSnapshotRequest).not.toHaveBeenCalled();
    expect(result.current.connectedUsers).toBeNull();

    rerender({ status: 'live' });
    await waitFor(() => expect(result.current.connectedUsers).toBe(7));
  });

  it('ante un error de snapshot, connectedUsers queda en null sin romper el resto', async () => {
    rematesApiMocks.fetchLotesRequest.mockResolvedValue({
      items: [lote('a', 'open')],
      total: 1,
      page: 1,
      page_size: 50,
    });
    salaApiMocks.fetchRemateSnapshotRequest.mockRejectedValue(new Error('falló'));

    const { result } = renderHook(() => useRemateOperationalInfo('remate-1', 'live'));

    await waitFor(() => expect(result.current.isLoadingLotes).toBe(false));
    expect(result.current.connectedUsers).toBeNull();
    expect(result.current.activeLote?.id).toBe('a');
  });
});

function makeRemate(overrides: Partial<Remate> = {}): Remate {
  return {
    id: 'remate-1',
    owner_id: 'owner-1',
    title: 'Remate',
    description: null,
    category: 'otros',
    cover_image_url: null,
    location: null,
    starts_at: '2026-07-18T10:00:00Z',
    ends_at: null,
    status: 'live',
    settings: { anti_sniping_enabled: false, anti_sniping_extension_seconds: 60, currency: 'ARS', lote_timer_seconds: null },
    cancellation_reason: null,
    cancelled_at: null,
    finished_at: null,
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
    ...overrides,
  };
}

describe('useElapsedTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-18T10:05:30Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('en "live", cuenta desde starts_at y avanza cada segundo', () => {
    const { result } = renderHook(() => useElapsedTime(makeRemate({ status: 'live' })));

    expect(result.current).toBe('5:30');

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current).toBe('5:32');
  });

  it('en "paused", también cuenta (no se congela en este módulo)', () => {
    const { result } = renderHook(() => useElapsedTime(makeRemate({ status: 'paused' })));
    expect(result.current).toBe('5:30');
  });

  it('en "finished", es fijo (finished_at - starts_at), sin ticking', () => {
    const { result } = renderHook(() =>
      useElapsedTime(
        makeRemate({ status: 'finished', finished_at: '2026-07-18T11:30:00Z' }),
      ),
    );

    expect(result.current).toBe('1h 30m');

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current).toBe('1h 30m');
  });

  it('en "scheduled"/"draft"/"cancelled", o sin starts_at, devuelve null', () => {
    expect(renderHook(() => useElapsedTime(makeRemate({ status: 'scheduled' }))).result.current).toBeNull();
    expect(renderHook(() => useElapsedTime(makeRemate({ status: 'draft' }))).result.current).toBeNull();
    expect(renderHook(() => useElapsedTime(makeRemate({ status: 'cancelled' }))).result.current).toBeNull();
    expect(
      renderHook(() => useElapsedTime(makeRemate({ status: 'live', starts_at: null }))).result.current,
    ).toBeNull();
  });

  it('sin remate (null), devuelve null', () => {
    expect(renderHook(() => useElapsedTime(null)).result.current).toBeNull();
  });
});

describe('useLiveOperationalSummary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('suma compradores conectados y cuenta lotes abiertos a través de los remates en vivo', async () => {
    salaApiMocks.fetchRemateSnapshotRequest.mockImplementation(async (remateId: string) => {
      if (remateId === 'r1') return { connected_users: 3, active_lote: { id: 'lote-1' } };
      return { connected_users: 5, active_lote: null };
    });

    const { result } = renderHook(() => useLiveOperationalSummary(['r1', 'r2']));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toEqual({ connectedUsers: 8, openLotes: 1 });
    expect(salaApiMocks.fetchRemateSnapshotRequest).toHaveBeenCalledTimes(2);
  });

  it('con la lista vacía, no pide nada y devuelve ceros', () => {
    const { result } = renderHook(() => useLiveOperationalSummary([]));

    expect(salaApiMocks.fetchRemateSnapshotRequest).not.toHaveBeenCalled();
    expect(result.current.data).toEqual({ connectedUsers: 0, openLotes: 0 });
  });

  it('si un snapshot falla, lo ignora sin romper el agregado del resto', async () => {
    salaApiMocks.fetchRemateSnapshotRequest.mockImplementation(async (remateId: string) => {
      if (remateId === 'r1') throw new Error('falló');
      return { connected_users: 4, active_lote: { id: 'lote-2' } };
    });

    const { result } = renderHook(() => useLiveOperationalSummary(['r1', 'r2']));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toEqual({ connectedUsers: 4, openLotes: 1 });
  });
});
