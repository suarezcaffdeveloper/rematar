import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useAsyncResource } from './useAsyncResource';

describe('useAsyncResource', () => {
  it('arranca en isLoading y expone el resultado del fetcher', async () => {
    const fetcher = vi.fn().mockResolvedValue('ok');
    const { result } = renderHook(() => useAsyncResource(fetcher, [], null as string | null));

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data).toBe('ok');
    expect(result.current.error).toBeNull();
  });

  it('un error se expone normalizado', async () => {
    const fetcher = vi.fn().mockRejectedValue({
      isAxiosError: true,
      response: { status: 500, data: { error: { code: 'http_error', message: 'Error.' } } },
    });
    const { result } = renderHook(() => useAsyncResource(fetcher, [], null as string | null));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error?.message).toBe('Error.');
  });

  it('reload() vuelve a llamar al fetcher', async () => {
    const fetcher = vi.fn().mockResolvedValue('primero');
    const { result } = renderHook(() => useAsyncResource(fetcher, [], null as string | null));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    fetcher.mockResolvedValue('segundo');
    result.current.reload();

    await waitFor(() => expect(result.current.data).toBe('segundo'));
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('un cambio en deps dispara un nuevo fetch', async () => {
    const fetcher = vi.fn().mockResolvedValue('a');
    const { result, rerender } = renderHook(({ dep }) => useAsyncResource(fetcher, [dep], null as string | null), {
      initialProps: { dep: 1 },
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    fetcher.mockResolvedValue('b');
    rerender({ dep: 2 });

    await waitFor(() => expect(result.current.data).toBe('b'));
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('con enabled: false, no llama al fetcher y queda cargando', () => {
    const fetcher = vi.fn().mockResolvedValue('ok');
    const { result } = renderHook(() =>
      useAsyncResource(fetcher, [], null as string | null, { enabled: false }),
    );

    expect(fetcher).not.toHaveBeenCalled();
    expect(result.current.isLoading).toBe(true);
  });
});
