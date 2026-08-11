import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { usePagedList } from './usePagedList';

describe('usePagedList', () => {
  it('pagina la lista según el tamaño de página dado', () => {
    const items = Array.from({ length: 25 }, (_, i) => i + 1);
    const { result } = renderHook(() => usePagedList(items, 12));

    expect(result.current.page).toBe(1);
    expect(result.current.totalPages).toBe(3);
    expect(result.current.pageItems).toEqual(items.slice(0, 12));
  });

  it('goToPage cambia la página mostrada', () => {
    const items = Array.from({ length: 25 }, (_, i) => i + 1);
    const { result } = renderHook(() => usePagedList(items, 12));

    act(() => result.current.goToPage(2));

    expect(result.current.page).toBe(2);
    expect(result.current.pageItems).toEqual(items.slice(12, 24));
  });

  it('si la lista se achica y la página actual queda fuera de rango, se ajusta a la última válida', () => {
    let items = Array.from({ length: 25 }, (_, i) => i + 1);
    const { result, rerender } = renderHook(({ list }) => usePagedList(list, 12), {
      initialProps: { list: items },
    });

    act(() => result.current.goToPage(3));
    expect(result.current.page).toBe(3);

    items = items.slice(0, 5);
    rerender({ list: items });

    expect(result.current.page).toBe(1);
    expect(result.current.pageItems).toEqual(items);
  });

  it('resetPage vuelve a la primera página', () => {
    const items = Array.from({ length: 25 }, (_, i) => i + 1);
    const { result } = renderHook(() => usePagedList(items, 12));

    act(() => result.current.goToPage(2));
    expect(result.current.page).toBe(2);

    act(() => result.current.resetPage());
    expect(result.current.page).toBe(1);
  });

  it('con la lista vacía, totalPages es 1 y no rompe', () => {
    const { result } = renderHook(() => usePagedList([] as number[], 12));

    expect(result.current.totalPages).toBe(1);
    expect(result.current.pageItems).toEqual([]);
  });
});
