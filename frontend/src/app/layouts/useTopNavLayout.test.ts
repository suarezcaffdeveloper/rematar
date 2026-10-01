import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useLayoutPreferencesStore } from './layoutPreferencesStore';
import { useTopNavLayout } from './useTopNavLayout';

afterEach(() => {
  act(() => {
    useLayoutPreferencesStore.setState({ isTopNav: false, isTopNavStatic: false });
  });
});

const state = () => useLayoutPreferencesStore.getState();

describe('useTopNavLayout', () => {
  it('pide la barra superior al montar, común (que se achica al scrollear), y la suelta al desmontar', () => {
    const { unmount } = renderHook(() => useTopNavLayout());
    expect(state().isTopNav).toBe(true);
    expect(state().isTopNavStatic).toBe(false);

    unmount();
    expect(state().isTopNav).toBe(false);
  });

  it('con staticBar pide la barra fija al principio de la página, y la suelta al desmontar', () => {
    const { unmount } = renderHook(() => useTopNavLayout({ staticBar: true }));
    expect(state().isTopNav).toBe(true);
    expect(state().isTopNavStatic).toBe(true);

    unmount();
    expect(state().isTopNav).toBe(false);
    expect(state().isTopNavStatic).toBe(false);
  });

  it('un estado estático nunca queda colgado sin la barra: setTopNav(false, true) no deja isTopNavStatic en true', () => {
    act(() => {
      state().setTopNav(false, true);
    });

    expect(state().isTopNavStatic).toBe(false);
  });
});
