import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useFocusMode } from './useFocusMode';
import { useLayoutPreferencesStore } from './layoutPreferencesStore';

afterEach(() => {
  act(() => {
    useLayoutPreferencesStore.setState({ isFocusMode: false });
  });
});

describe('useFocusMode', () => {
  it('marca isFocusMode en true al montar con enabled=true', () => {
    renderHook(() => useFocusMode(true));

    expect(useLayoutPreferencesStore.getState().isFocusMode).toBe(true);
  });

  it('no marca isFocusMode con enabled=false', () => {
    renderHook(() => useFocusMode(false));

    expect(useLayoutPreferencesStore.getState().isFocusMode).toBe(false);
  });

  it('reacciona a que enabled cambie sin desmontar', () => {
    const { rerender } = renderHook(({ enabled }) => useFocusMode(enabled), {
      initialProps: { enabled: false },
    });
    expect(useLayoutPreferencesStore.getState().isFocusMode).toBe(false);

    rerender({ enabled: true });
    expect(useLayoutPreferencesStore.getState().isFocusMode).toBe(true);

    rerender({ enabled: false });
    expect(useLayoutPreferencesStore.getState().isFocusMode).toBe(false);
  });

  it('vuelve a false al desmontar', () => {
    const { unmount } = renderHook(() => useFocusMode(true));
    expect(useLayoutPreferencesStore.getState().isFocusMode).toBe(true);

    unmount();

    expect(useLayoutPreferencesStore.getState().isFocusMode).toBe(false);
  });
});
