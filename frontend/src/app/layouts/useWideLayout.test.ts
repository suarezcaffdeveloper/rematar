import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useWideLayout } from './useWideLayout';
import { useLayoutPreferencesStore } from './layoutPreferencesStore';

afterEach(() => {
  act(() => {
    useLayoutPreferencesStore.setState({ isWide: false });
  });
});

describe('useWideLayout', () => {
  it('marca isWide en true al montar', () => {
    renderHook(() => useWideLayout());

    expect(useLayoutPreferencesStore.getState().isWide).toBe(true);
  });

  it('vuelve a false al desmontar', () => {
    const { unmount } = renderHook(() => useWideLayout());
    expect(useLayoutPreferencesStore.getState().isWide).toBe(true);

    unmount();

    expect(useLayoutPreferencesStore.getState().isWide).toBe(false);
  });
});
