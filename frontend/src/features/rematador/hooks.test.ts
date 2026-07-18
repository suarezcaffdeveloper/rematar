import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { RemateStatus } from '../remates/types';

const rematesApiMocks = vi.hoisted(() => ({
  fetchLotesRequest: vi.fn(),
}));
const salaApiMocks = vi.hoisted(() => ({
  fetchRemateSnapshotRequest: vi.fn(),
}));

vi.mock('../remates/api', () => rematesApiMocks);
vi.mock('../sala/api', () => salaApiMocks);

const { useRemateOperationalInfo } = await import('./hooks');

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
