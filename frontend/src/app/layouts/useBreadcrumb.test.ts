import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useBreadcrumb } from './useBreadcrumb';
import { useBreadcrumbStore } from './breadcrumbStore';

afterEach(() => {
  act(() => {
    useBreadcrumbStore.setState({ items: [] });
  });
});

describe('useBreadcrumb', () => {
  it('setea los items en el store al montar', () => {
    renderHook(() => useBreadcrumb([{ label: 'Inicio', to: '/' }, { label: 'Detalle' }]));

    expect(useBreadcrumbStore.getState().items).toEqual([
      { label: 'Inicio', to: '/' },
      { label: 'Detalle' },
    ]);
  });

  it('limpia los items al desmontar', () => {
    const { unmount } = renderHook(() => useBreadcrumb([{ label: 'Algo' }]));
    expect(useBreadcrumbStore.getState().items).toHaveLength(1);

    unmount();

    expect(useBreadcrumbStore.getState().items).toEqual([]);
  });
});
