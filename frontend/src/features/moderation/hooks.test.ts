import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { ConnectedBuyer, PinnedMessage } from './types';

const apiMocks = vi.hoisted(() => ({
  fetchConnectedBuyersRequest: vi.fn(),
  fetchPinnedMessagesRequest: vi.fn(),
  fetchModerationHistoryRequest: vi.fn(),
}));

vi.mock('./api', () => apiMocks);

const { useConnectedBuyers, usePinnedMessages, useModerationHistory } = await import('./hooks');

function makeBuyer(overrides: Partial<ConnectedBuyer> = {}): ConnectedBuyer {
  return {
    user_id: 'buyer-1',
    full_name: 'Juan Comprador',
    connected_at: '2026-07-23T10:00:00Z',
    is_muted: false,
    ...overrides,
  };
}

function makePin(overrides: Partial<PinnedMessage> = {}): PinnedMessage {
  return {
    message_id: 'msg-1',
    content: 'Anuncio importante',
    author_name: 'Rematador',
    pinned_by: 'rematador-1',
    pinned_at: '2026-07-23T10:05:00Z',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useConnectedBuyers', () => {
  it('carga la lista de conectados con el término de búsqueda', async () => {
    apiMocks.fetchConnectedBuyersRequest.mockResolvedValue([makeBuyer()]);

    const { result } = renderHook(() => useConnectedBuyers('remate-1', 'juan'));
    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data).toHaveLength(1);
    expect(apiMocks.fetchConnectedBuyersRequest).toHaveBeenCalledWith('remate-1', 'juan');
  });

  it('reload() vuelve a pedir la lista', async () => {
    apiMocks.fetchConnectedBuyersRequest.mockResolvedValue([]);
    const { result } = renderHook(() => useConnectedBuyers('remate-1', ''));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    apiMocks.fetchConnectedBuyersRequest.mockResolvedValue([makeBuyer()]);
    result.current.reload();

    await waitFor(() => expect(result.current.data).toHaveLength(1));
    expect(apiMocks.fetchConnectedBuyersRequest).toHaveBeenCalledTimes(2);
  });

  it('un error se expone normalizado', async () => {
    apiMocks.fetchConnectedBuyersRequest.mockRejectedValue({
      isAxiosError: true,
      response: { status: 403, data: { error: { code: 'forbidden', message: 'No autorizado.' } } },
    });

    const { result } = renderHook(() => useConnectedBuyers('remate-1', ''));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error?.message).toBe('No autorizado.');
  });
});

describe('usePinnedMessages', () => {
  it('no pide nada si remateId está vacío', () => {
    renderHook(() => usePinnedMessages(''));
    expect(apiMocks.fetchPinnedMessagesRequest).not.toHaveBeenCalled();
  });

  it('carga los mensajes destacados', async () => {
    apiMocks.fetchPinnedMessagesRequest.mockResolvedValue([makePin()]);

    const { result } = renderHook(() => usePinnedMessages('remate-1'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data).toEqual([makePin()]);
  });
});

describe('useModerationHistory', () => {
  it('carga el historial paginado', async () => {
    apiMocks.fetchModerationHistoryRequest.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      page_size: 10,
    });

    const { result } = renderHook(() => useModerationHistory('remate-1', 1, 10));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(apiMocks.fetchModerationHistoryRequest).toHaveBeenCalledWith('remate-1', 1, 10);
    expect(result.current.data?.total).toBe(0);
  });
});
