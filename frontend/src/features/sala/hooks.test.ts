import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { Lote, Remate } from '../remates/types';
import type { RemateStateSnapshot } from './types';

interface FakeWebSocketClientOptions {
  url: string;
  getToken: () => string | null;
}

class FakeWebSocketClient {
  static instances: FakeWebSocketClient[] = [];
  options: FakeWebSocketClientOptions;
  disconnected = false;
  joinedRoomId: string | null = null;
  private statusListeners: ((status: string) => void)[] = [];
  private messageListeners: ((message: unknown) => void)[] = [];

  constructor(options: FakeWebSocketClientOptions) {
    this.options = options;
    FakeWebSocketClient.instances.push(this);
  }

  connect(): void {}

  disconnect(): void {
    this.disconnected = true;
  }

  joinRoom(remateId: string): void {
    this.joinedRoomId = remateId;
  }

  leaveRoom(): void {
    this.joinedRoomId = null;
  }

  send(): void {}

  getStatus(): string {
    return 'open';
  }

  onStatusChange(listener: (status: string) => void): () => void {
    this.statusListeners.push(listener);
    return () => {
      this.statusListeners = this.statusListeners.filter((l) => l !== listener);
    };
  }

  onMessage(listener: (message: unknown) => void): () => void {
    this.messageListeners.push(listener);
    return () => {
      this.messageListeners = this.messageListeners.filter((l) => l !== listener);
    };
  }

  emitStatus(status: string): void {
    this.statusListeners.forEach((listener) => listener(status));
  }

  emitMessage(message: unknown): void {
    this.messageListeners.forEach((listener) => listener(message));
  }
}

const apiMocks = vi.hoisted(() => ({
  fetchRemateSnapshotRequest: vi.fn(),
}));

const rematesHooksMocks = vi.hoisted(() => ({
  useLotes: vi.fn(),
}));

vi.mock('./api', () => apiMocks);
vi.mock('../remates/hooks', () => rematesHooksMocks);
vi.mock('../../shared/api/client', () => ({ getSessionAccessToken: () => 'jwt-token' }));
vi.mock('../../shared/websocket/client', () => ({ WebSocketClient: FakeWebSocketClient }));

const { useRemateSnapshot, useLiveRemateState } = await import('./hooks');

function makeRemate(overrides: Partial<Remate> = {}): Remate {
  return {
    id: 'remate-1',
    owner_id: 'owner-1',
    title: 'Remate de prueba',
    description: null,
    category: 'hacienda',
    cover_image_url: null,
    location: null,
    starts_at: null,
    ends_at: null,
    status: 'live',
    settings: { anti_sniping_enabled: false, anti_sniping_extension_seconds: 60, currency: 'ARS' },
    cancellation_reason: null,
    cancelled_at: null,
    finished_at: null,
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
    ...overrides,
  };
}

function makeLote(overrides: Partial<Lote> = {}): Lote {
  return {
    id: 'lote-1',
    remate_id: 'remate-1',
    lot_number: '1',
    display_order: 0,
    title: 'Toro Angus',
    description: null,
    category: 'hacienda',
    attributes: {},
    images: [],
    quantity: 1,
    unit_label: null,
    base_price: '1000.00',
    min_increment: '50.00',
    reserve_price: null,
    final_price: null,
    status: 'pending',
    created_at: '2026-07-01T00:00:00Z',
    ...overrides,
  };
}

function makeSnapshot(overrides: Partial<RemateStateSnapshot> = {}): RemateStateSnapshot {
  return {
    schema_version: 1,
    remate: makeRemate(),
    active_lote: null,
    winning_offer: null,
    recent_offers: [],
    connected_users: 0,
    generated_at: '2026-07-01T00:00:00Z',
    ...overrides,
  };
}

describe('useRemateSnapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('empieza en loading y expone el snapshot una vez que resuelve', async () => {
    apiMocks.fetchRemateSnapshotRequest.mockResolvedValue(makeSnapshot());

    const { result } = renderHook(() => useRemateSnapshot('remate-1'));

    expect(result.current.isLoading).toBe(true);
    expect(result.current.snapshot).toBeNull();

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.snapshot?.remate.id).toBe('remate-1');
    expect(result.current.error).toBeNull();
  });

  it('ante un error, expone el error normalizado y deja snapshot en null', async () => {
    apiMocks.fetchRemateSnapshotRequest.mockRejectedValue({
      isAxiosError: true,
      response: { status: 404, data: { error: { code: 'not_found', message: 'Remate no encontrado.' } } },
    });

    const { result } = renderHook(() => useRemateSnapshot('inexistente'));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.snapshot).toBeNull();
    expect(result.current.error?.message).toBe('Remate no encontrado.');
  });

  it('reload() vuelve a pedir el mismo remate', async () => {
    apiMocks.fetchRemateSnapshotRequest.mockResolvedValue(makeSnapshot());

    const { result } = renderHook(() => useRemateSnapshot('remate-1'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    apiMocks.fetchRemateSnapshotRequest.mockClear();
    result.current.reload();

    await waitFor(() => expect(apiMocks.fetchRemateSnapshotRequest).toHaveBeenCalledWith('remate-1'));
  });

  it('no hace polling -- una sola llamada mientras el componente sigue montado', async () => {
    apiMocks.fetchRemateSnapshotRequest.mockResolvedValue(makeSnapshot());

    const { result } = renderHook(() => useRemateSnapshot('remate-1'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(apiMocks.fetchRemateSnapshotRequest).toHaveBeenCalledTimes(1);
  });
});

describe('useLiveRemateState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    FakeWebSocketClient.instances = [];
    apiMocks.fetchRemateSnapshotRequest.mockResolvedValue(makeSnapshot());
    rematesHooksMocks.useLotes.mockReturnValue({
      lotes: [makeLote({ id: 'lote-1', status: 'open' }), makeLote({ id: 'lote-2', status: 'pending' })],
      total: 2,
      isLoading: false,
      error: null,
      reload: vi.fn(),
    });
  });

  it('pinta primero el snapshot de useRemateSnapshot (HTTP), sin esperar al WebSocket', async () => {
    const { result } = renderHook(() => useLiveRemateState('remate-1'));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.snapshot?.remate.id).toBe('remate-1');
  });

  it('se conecta y se une a la sala del remate', async () => {
    renderHook(() => useLiveRemateState('remate-1'));

    await waitFor(() => expect(FakeWebSocketClient.instances).toHaveLength(1));
    expect(FakeWebSocketClient.instances[0].joinedRoomId).toBe('remate-1');
  });

  it('expone el connectionStatus recibido del cliente WebSocket', async () => {
    const { result } = renderHook(() => useLiveRemateState('remate-1'));
    await waitFor(() => expect(FakeWebSocketClient.instances).toHaveLength(1));

    act(() => {
      FakeWebSocketClient.instances[0].emitStatus('reconnecting');
    });

    expect(result.current.connectionStatus).toBe('reconnecting');
  });

  it('al llegar un mensaje "snapshot" por WS, reemplaza el snapshot completo (reconciliación tras reconexión)', async () => {
    const { result } = renderHook(() => useLiveRemateState('remate-1'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const freshSnapshot = makeSnapshot({ connected_users: 42 });
    act(() => {
      FakeWebSocketClient.instances[0].emitMessage({ schema_version: 1, type: 'snapshot', data: freshSnapshot });
    });

    expect(result.current.snapshot?.connected_users).toBe(42);
  });

  it('al llegar un domain_event, aplica el cambio incremental sin recargar todo', async () => {
    const { result } = renderHook(() =>
      useLiveRemateState('remate-1'),
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      FakeWebSocketClient.instances[0].emitMessage({
        schema_version: 1,
        type: 'domain_event',
        event_type: 'remate.paused',
        remate_id: 'remate-1',
        occurred_at: '2026-07-02T00:00:00Z',
        payload: { event_type: 'remate.paused', event_id: 'e1', remate_id: 'remate-1', occurred_at: '2026-07-02T00:00:00Z' },
      });
    });

    expect(result.current.snapshot?.remate.status).toBe('paused');
  });

  it('lote.opened saca ese lote de upcomingLotes y lo deja como active_lote', async () => {
    const { result } = renderHook(() => useLiveRemateState('remate-1'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.upcomingLotes.map((l) => l.id)).toEqual(['lote-2']);

    act(() => {
      FakeWebSocketClient.instances[0].emitMessage({
        schema_version: 1,
        type: 'domain_event',
        event_type: 'lote.opened',
        remate_id: 'remate-1',
        occurred_at: 't',
        payload: {
          event_type: 'lote.opened',
          event_id: 'e1',
          remate_id: 'remate-1',
          occurred_at: 't',
          lote_id: 'lote-2',
          lot_number: '2',
          display_order: 1,
        },
      });
    });

    expect(result.current.upcomingLotes).toEqual([]);
    expect(result.current.snapshot?.active_lote?.id).toBe('lote-2');
  });

  it('al desmontar, desconecta el cliente WebSocket', async () => {
    const { unmount } = renderHook(() => useLiveRemateState('remate-1'));
    await waitFor(() => expect(FakeWebSocketClient.instances).toHaveLength(1));

    unmount();

    expect(FakeWebSocketClient.instances[0].disconnected).toBe(true);
  });
});
