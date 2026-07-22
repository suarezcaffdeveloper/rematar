import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { Page } from '../../shared/api/types';
import type {
  FinishedRemateSummary,
  HistoryListFilters,
  LoteHistoryDetail,
  RemateHistoryDetail,
} from './types';

const apiMocks = vi.hoisted(() => ({
  fetchFinishedRemateHistoryRequest: vi.fn(),
  fetchRemateHistoryDetailRequest: vi.fn(),
  fetchLoteHistoryDetailRequest: vi.fn(),
}));

vi.mock('./api', () => apiMocks);

const { useFinishedRemates, useLoteHistoryDetail, useRemateHistoryDetail } = await import('./hooks');

function makeSummaryPage(overrides: Partial<Page<FinishedRemateSummary>> = {}): Page<FinishedRemateSummary> {
  return {
    items: [
      {
        id: 'remate-1',
        title: 'Remate de prueba',
        category: 'hacienda',
        status: 'finished',
        starts_at: '2026-07-01T10:00:00Z',
        resolved_at: '2026-07-01T12:00:00Z',
        lote_count: 3,
        lotes_sold_count: 2,
        total_awarded_value: '1500.00',
        buyer_count: 2,
        duration_seconds: 3600,
        owner_id: 'owner-1',
        owner_name: 'Ana Rematadora',
      },
    ],
    total: 1,
    page: 1,
    page_size: 12,
    ...overrides,
  };
}

function makeDetail(overrides: Partial<RemateHistoryDetail> = {}): RemateHistoryDetail {
  return {
    remate_id: 'remate-1',
    title: 'Remate de prueba',
    category: 'hacienda',
    status: 'finished',
    starts_at: '2026-07-01T10:00:00Z',
    finished_at: '2026-07-01T12:00:00Z',
    cancelled_at: null,
    cancellation_reason: null,
    duration_seconds: 3600,
    lote_status_counts: { pending: 0, open: 0, closed_sold: 2, closed_unsold: 1, cancelled: 0, total: 3 },
    average_lote_duration_seconds: 120,
    total_awarded_value: '1500.00',
    total_ofertas: 5,
    highest_oferta: null,
    top_lote_by_offers: null,
    chat_activity: { message_count: 4, deleted_count: 0, participant_count: 2 },
    participants_count: 3,
    generated_at: '2026-07-01T12:00:01Z',
    ...overrides,
  };
}

function makeLoteDetail(overrides: Partial<LoteHistoryDetail> = {}): LoteHistoryDetail {
  return {
    id: 'lote-1',
    remate_id: 'remate-1',
    lot_number: '1',
    title: 'Toro Angus',
    category: 'hacienda',
    status: 'closed_sold',
    base_price: '1000.00',
    final_price: '1200.00',
    winner: { buyer_id: 'buyer-1', buyer_name: 'Carlos Comprador', amount: '1200.00' },
    offer_count: 1,
    time_open_seconds: 90,
    opened_at: '2026-07-01T10:00:00Z',
    closed_at: '2026-07-01T10:01:30Z',
    cancellation_reason: null,
    offer_history: { items: [], total: 1, page: 1, page_size: 20 },
    ...overrides,
  };
}

describe('useFinishedRemates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.fetchFinishedRemateHistoryRequest.mockResolvedValue(makeSummaryPage());
  });

  it('hace un fetch al montar y expone el resultado', async () => {
    const { result } = renderHook(() => useFinishedRemates({ sort: 'date_desc' }, 1, 12));

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data?.total).toBe(1);
    expect(apiMocks.fetchFinishedRemateHistoryRequest).toHaveBeenCalledTimes(1);
    expect(apiMocks.fetchFinishedRemateHistoryRequest).toHaveBeenCalledWith(
      { search: undefined, date_from: undefined, date_to: undefined, sort: 'date_desc' },
      1,
      12,
    );
  });

  it('cambiar un filtro dispara un nuevo fetch', async () => {
    const { result, rerender } = renderHook(
      ({ filters }) => useFinishedRemates(filters, 1, 12),
      { initialProps: { filters: { sort: 'date_desc' } as HistoryListFilters } },
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    apiMocks.fetchFinishedRemateHistoryRequest.mockClear();

    rerender({ filters: { sort: 'date_desc', search: 'Zebra' } as HistoryListFilters });

    await waitFor(() => expect(apiMocks.fetchFinishedRemateHistoryRequest).toHaveBeenCalledTimes(1));
    expect(apiMocks.fetchFinishedRemateHistoryRequest).toHaveBeenCalledWith(
      expect.objectContaining({ search: 'Zebra' }),
      1,
      12,
    );
  });

  it('un error se expone en error y data queda en null', async () => {
    apiMocks.fetchFinishedRemateHistoryRequest.mockRejectedValue({
      isAxiosError: true,
      response: { status: 403, data: { error: { code: 'forbidden', message: 'No tenés acceso.' } } },
    });

    const { result } = renderHook(() => useFinishedRemates({ sort: 'date_desc' }, 1, 12));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error?.message).toBe('No tenés acceso.');
    expect(result.current.data).toBeNull();
  });
});

describe('useRemateHistoryDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.fetchRemateHistoryDetailRequest.mockResolvedValue(makeDetail());
  });

  it('carga el detalle y lo expone', async () => {
    const { result } = renderHook(() => useRemateHistoryDetail('remate-1'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data?.total_ofertas).toBe(5);
    expect(apiMocks.fetchRemateHistoryDetailRequest).toHaveBeenCalledWith('remate-1');
  });

  it('reload() vuelve a pedir el detalle', async () => {
    const { result } = renderHook(() => useRemateHistoryDetail('remate-1'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    apiMocks.fetchRemateHistoryDetailRequest.mockClear();

    result.current.reload();

    await waitFor(() => expect(apiMocks.fetchRemateHistoryDetailRequest).toHaveBeenCalledTimes(1));
  });

  it('un error 422 (remate no terminal) se expone en error', async () => {
    apiMocks.fetchRemateHistoryDetailRequest.mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 422,
        data: {
          error: {
            code: 'business_rule_violation',
            message: 'El historial solo está disponible para remates finalizados o cancelados.',
          },
        },
      },
    });

    const { result } = renderHook(() => useRemateHistoryDetail('remate-1'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error?.message).toContain('finalizados o cancelados');
  });
});

describe('useLoteHistoryDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.fetchLoteHistoryDetailRequest.mockResolvedValue(makeLoteDetail());
  });

  it('carga el detalle del lote con la página pedida', async () => {
    const { result } = renderHook(() => useLoteHistoryDetail('remate-1', 'lote-1', 2, 20));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data?.winner?.buyer_name).toBe('Carlos Comprador');
    expect(apiMocks.fetchLoteHistoryDetailRequest).toHaveBeenCalledWith('remate-1', 'lote-1', 2, 20);
  });

  it('cambiar de página dispara un nuevo fetch', async () => {
    const { result, rerender } = renderHook(
      ({ page }) => useLoteHistoryDetail('remate-1', 'lote-1', page, 20),
      { initialProps: { page: 1 } },
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    apiMocks.fetchLoteHistoryDetailRequest.mockClear();

    rerender({ page: 2 });

    await waitFor(() =>
      expect(apiMocks.fetchLoteHistoryDetailRequest).toHaveBeenCalledWith('remate-1', 'lote-1', 2, 20),
    );
  });
});
