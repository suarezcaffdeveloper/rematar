import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { PostAuctionCase, PostAuctionCaseDetail } from './types';

const apiMocks = vi.hoisted(() => ({
  fetchVentasAdjudicadasRequest: vi.fn(),
  fetchVentaDetailRequest: vi.fn(),
  fetchMisComprasRequest: vi.fn(),
  fetchMiCompraDetailRequest: vi.fn(),
}));

vi.mock('./api', () => apiMocks);

const { useVentasAdjudicadas, useVentaDetail, useMisCompras, useMiCompraDetail } = await import(
  './hooks'
);

function makeCase(overrides: Partial<PostAuctionCase> = {}): PostAuctionCase {
  return {
    id: 'case-1',
    lote_id: 'lote-1',
    lot_number: '1',
    lote_title: 'Toro Angus',
    remate_id: 'remate-1',
    remate_title: 'Remate de campo',
    buyer_id: 'buyer-1',
    buyer_name: 'Juan Comprador',
    rematador_id: 'rematador-1',
    rematador_name: 'Ana Rematadora',
    final_price: '1500.00',
    status: 'adjudicado',
    contacted_at: null,
    payment_at: null,
    shipped_at: null,
    delivered_at: null,
    finalized_at: null,
    notes: null,
    created_at: '2026-07-20T10:00:00Z',
    updated_at: '2026-07-20T10:00:00Z',
    ...overrides,
  };
}

function makeDetail(overrides: Partial<PostAuctionCaseDetail> = {}): PostAuctionCaseDetail {
  return { ...makeCase(), timeline: [], ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useVentasAdjudicadas', () => {
  it('carga el listado con los filtros/página/tamaño dados', async () => {
    apiMocks.fetchVentasAdjudicadasRequest.mockResolvedValue({
      items: [makeCase()],
      total: 1,
      page: 1,
      page_size: 12,
    });

    const { result } = renderHook(() => useVentasAdjudicadas({ status: 'adjudicado' }, 1, 12));

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data?.items).toHaveLength(1);
    expect(apiMocks.fetchVentasAdjudicadasRequest).toHaveBeenCalledWith(
      { status: 'adjudicado', remate_id: undefined, search: undefined },
      1,
      12,
    );
  });

  it('un error se expone normalizado', async () => {
    apiMocks.fetchVentasAdjudicadasRequest.mockRejectedValue({
      isAxiosError: true,
      response: { status: 403, data: { error: { code: 'forbidden', message: 'No autorizado.' } } },
    });

    const { result } = renderHook(() => useVentasAdjudicadas({}, 1, 12));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error?.message).toBe('No autorizado.');
    expect(result.current.data).toBeNull();
  });
});

describe('useVentaDetail', () => {
  it('carga el detalle y permite recargar tras una mutación', async () => {
    apiMocks.fetchVentaDetailRequest.mockResolvedValue(makeDetail());

    const { result } = renderHook(() => useVentaDetail('case-1'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data?.id).toBe('case-1');
    expect(apiMocks.fetchVentaDetailRequest).toHaveBeenCalledTimes(1);

    apiMocks.fetchVentaDetailRequest.mockResolvedValue(
      makeDetail({ status: 'pendiente_contacto' }),
    );
    result.current.reload();

    await waitFor(() => expect(result.current.data?.status).toBe('pendiente_contacto'));
    expect(apiMocks.fetchVentaDetailRequest).toHaveBeenCalledTimes(2);
  });
});

describe('useMisCompras', () => {
  it('carga las compras propias', async () => {
    apiMocks.fetchMisComprasRequest.mockResolvedValue({
      items: [makeCase({ id: 'case-2' })],
      total: 1,
      page: 1,
      page_size: 12,
    });

    const { result } = renderHook(() => useMisCompras(1, 12));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data?.items[0].id).toBe('case-2');
  });
});

describe('useMiCompraDetail', () => {
  it('carga el detalle de una compra propia', async () => {
    apiMocks.fetchMiCompraDetailRequest.mockResolvedValue(makeDetail({ id: 'case-3' }));

    const { result } = renderHook(() => useMiCompraDetail('case-3'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data?.id).toBe('case-3');
  });
});
