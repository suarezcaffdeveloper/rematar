import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useGarantiaStatus } from './hooks';
import type { Garantia } from './types';

const { fetchMyGarantiaRequestMock, toastPushMock } = vi.hoisted(() => ({
  fetchMyGarantiaRequestMock: vi.fn(),
  toastPushMock: vi.fn(),
}));

vi.mock('./api', () => ({ fetchMyGarantiaRequest: fetchMyGarantiaRequestMock }));
vi.mock('../../shared/toast/toastStore', () => ({
  useToastStore: { getState: () => ({ push: toastPushMock }) },
}));

function makeGarantia(overrides: Partial<Garantia> = {}): Garantia {
  return {
    id: 'garantia-1',
    remate_id: 'remate-1',
    status: 'active',
    amount: '50000.00',
    currency: 'ARS',
    expires_at: '2026-08-10T00:00:00Z',
    failure_reason: null,
    created_at: '2026-08-01T00:00:00Z',
    ...overrides,
  };
}

describe('useGarantiaStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('arranca en null y pasa al estado resuelto cuando el fetch inicial contesta', async () => {
    fetchMyGarantiaRequestMock.mockResolvedValue(makeGarantia({ status: 'active' }));
    const onStatusChange = vi.fn();
    const { result } = renderHook(() => useGarantiaStatus('remate-1', onStatusChange));

    expect(result.current.status).toBeNull();

    await waitFor(() => expect(result.current.status).toBe('active'));
    expect(onStatusChange).toHaveBeenCalledWith('active');
  });

  it('sin garantía constituida (null del backend), queda en null', async () => {
    fetchMyGarantiaRequestMock.mockResolvedValue(null);
    const { result } = renderHook(() => useGarantiaStatus('remate-1'));

    await waitFor(() => expect(fetchMyGarantiaRequestMock).toHaveBeenCalledWith('remate-1'));
    expect(result.current.status).toBeNull();
  });

  it('reportGarantia registra una resolución nueva y la notifica hacia afuera', async () => {
    fetchMyGarantiaRequestMock.mockResolvedValue(null);
    const onStatusChange = vi.fn();
    const { result } = renderHook(() => useGarantiaStatus('remate-1', onStatusChange));
    await waitFor(() => expect(fetchMyGarantiaRequestMock).toHaveBeenCalled());

    act(() => result.current.reportGarantia(makeGarantia({ status: 'active' })));

    expect(result.current.status).toBe('active');
    expect(onStatusChange).toHaveBeenCalledWith('active');
  });

  it('reportGarantia con el mismo estado no vuelve a notificar (igual que el GarantiaGate original)', async () => {
    fetchMyGarantiaRequestMock.mockResolvedValue(makeGarantia({ status: 'active' }));
    const onStatusChange = vi.fn();
    const { result } = renderHook(() => useGarantiaStatus('remate-1', onStatusChange));
    await waitFor(() => expect(result.current.status).toBe('active'));
    const callsAfterInitial = onStatusChange.mock.calls.length;

    act(() => result.current.reportGarantia(makeGarantia({ status: 'active' })));

    expect(onStatusChange.mock.calls.length).toBe(callsAfterInitial);
  });

  it('un fetch fallido avisa con un toast de error, sin cambiar el estado', async () => {
    fetchMyGarantiaRequestMock.mockRejectedValue(new Error('network down'));
    const { result } = renderHook(() => useGarantiaStatus('remate-1'));

    await waitFor(() => expect(toastPushMock).toHaveBeenCalledWith('error', expect.any(String)));
    expect(result.current.status).toBeNull();
  });
});
