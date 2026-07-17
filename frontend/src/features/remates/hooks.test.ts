import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const apiMocks = vi.hoisted(() => ({
  fetchRematesRequest: vi.fn(),
  fetchLoteCountRequest: vi.fn(),
  fetchRemateByIdRequest: vi.fn(),
  fetchLotesRequest: vi.fn(),
}));

vi.mock('./api', () => apiMocks);

const { useLoteCount, useRemates, useRemateDetail, useLotes } = await import('./hooks');

function remate(id: string) {
  return { id, title: `Remate ${id}` };
}

function lote(id: string) {
  return { id, title: `Lote ${id}` };
}

describe('useRemates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('empieza en loading y expone la lista una vez que resuelve', async () => {
    apiMocks.fetchRematesRequest.mockResolvedValue({
      items: [remate('a'), remate('b')],
      total: 2,
      page: 1,
      page_size: 100,
    });

    const { result } = renderHook(() => useRemates());

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.remates.map((r) => r.id)).toEqual(['a', 'b']);
    expect(result.current.error).toBeNull();
  });

  it('sigue pidiendo páginas hasta juntar el total', async () => {
    apiMocks.fetchRematesRequest.mockImplementation(async (params: { page: number }) => {
      if (params.page === 1) {
        return {
          items: Array.from({ length: 100 }, (_, i) => remate(`p1-${i}`)),
          total: 120,
          page: 1,
          page_size: 100,
        };
      }
      return { items: Array.from({ length: 20 }, (_, i) => remate(`p2-${i}`)), total: 120, page: 2, page_size: 100 };
    });

    const { result } = renderHook(() => useRemates());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.remates).toHaveLength(120);
    expect(apiMocks.fetchRematesRequest).toHaveBeenCalledTimes(2);
  });

  it('ante un error, no reintenta solo -- expone el error normalizado y deja la lista vacía', async () => {
    apiMocks.fetchRematesRequest.mockRejectedValue({
      isAxiosError: true,
      response: { status: 500, data: {} },
    });

    const { result } = renderHook(() => useRemates());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.remates).toEqual([]);
    expect(result.current.error).not.toBeNull();
  });

  it('reload() vuelve a disparar la carga completa', async () => {
    apiMocks.fetchRematesRequest.mockResolvedValue({
      items: [remate('a')],
      total: 1,
      page: 1,
      page_size: 100,
    });

    const { result } = renderHook(() => useRemates());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    apiMocks.fetchRematesRequest.mockClear();
    result.current.reload();

    await waitFor(() => expect(apiMocks.fetchRematesRequest).toHaveBeenCalledTimes(1));
  });
});

describe('useLoteCount', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('devuelve null mientras carga y el total una vez que resuelve', async () => {
    apiMocks.fetchLoteCountRequest.mockResolvedValue(5);

    const { result } = renderHook(() => useLoteCount('remate-1'));

    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current).toBe(5));
  });

  it('ante un error, se queda en null en vez de romper la tarjeta', async () => {
    apiMocks.fetchLoteCountRequest.mockRejectedValue(new Error('falló'));

    const { result } = renderHook(() => useLoteCount('remate-1'));

    await waitFor(() => expect(apiMocks.fetchLoteCountRequest).toHaveBeenCalled());
    expect(result.current).toBeNull();
  });
});

describe('useRemateDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('empieza en loading y expone el remate una vez que resuelve', async () => {
    apiMocks.fetchRemateByIdRequest.mockResolvedValue(remate('a'));

    const { result } = renderHook(() => useRemateDetail('a'));

    expect(result.current.isLoading).toBe(true);
    expect(result.current.remate).toBeNull();

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.remate?.id).toBe('a');
    expect(result.current.error).toBeNull();
  });

  it('ante un 404, expone el error normalizado y deja remate en null', async () => {
    apiMocks.fetchRemateByIdRequest.mockRejectedValue({
      isAxiosError: true,
      response: { status: 404, data: { error: { code: 'not_found', message: 'Remate no encontrado.' } } },
    });

    const { result } = renderHook(() => useRemateDetail('inexistente'));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.remate).toBeNull();
    expect(result.current.error?.message).toBe('Remate no encontrado.');
  });

  it('reload() vuelve a pedir el mismo remate', async () => {
    apiMocks.fetchRemateByIdRequest.mockResolvedValue(remate('a'));

    const { result } = renderHook(() => useRemateDetail('a'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    apiMocks.fetchRemateByIdRequest.mockClear();
    result.current.reload();

    await waitFor(() => expect(apiMocks.fetchRemateByIdRequest).toHaveBeenCalledWith('a'));
  });
});

describe('useLotes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('empieza en loading y expone lotes + total una vez que resuelve', async () => {
    apiMocks.fetchLotesRequest.mockResolvedValue({
      items: [lote('a'), lote('b')],
      total: 2,
      page: 1,
      page_size: 100,
    });

    const { result } = renderHook(() => useLotes('remate-1'));

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.lotes.map((l) => l.id)).toEqual(['a', 'b']);
    expect(result.current.total).toBe(2);
    expect(result.current.error).toBeNull();
  });

  it('sigue pidiendo páginas hasta juntar el total', async () => {
    apiMocks.fetchLotesRequest.mockImplementation(async (_id: string, params: { page: number }) => {
      if (params.page === 1) {
        return {
          items: Array.from({ length: 100 }, (_, i) => lote(`p1-${i}`)),
          total: 110,
          page: 1,
          page_size: 100,
        };
      }
      return { items: Array.from({ length: 10 }, (_, i) => lote(`p2-${i}`)), total: 110, page: 2, page_size: 100 };
    });

    const { result } = renderHook(() => useLotes('remate-1'));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.lotes).toHaveLength(110);
    expect(apiMocks.fetchLotesRequest).toHaveBeenCalledTimes(2);
  });

  it('ante un error, expone el error normalizado y deja la lista vacía', async () => {
    apiMocks.fetchLotesRequest.mockRejectedValue({
      isAxiosError: true,
      response: { status: 500, data: {} },
    });

    const { result } = renderHook(() => useLotes('remate-1'));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.lotes).toEqual([]);
    expect(result.current.error).not.toBeNull();
  });
});
