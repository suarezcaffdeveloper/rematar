/**
 * Estado global mínimo para que una página le pida a `AppLayout` un `<main>` más ancho
 * que el `max-w-5xl` por default (Épica 9, Etapa 4 -- rediseño de Sala del Remate).
 * Mismo patrón que `breadcrumbStore.ts`: Zustand sin persistencia, la página setea su
 * preferencia vía `useWideLayout` (ver ese archivo), `AppLayout` es el único que la lee.
 */

import { create } from 'zustand';

interface LayoutPreferencesState {
  isWide: boolean;
  setWide: (wide: boolean) => void;
}

export const useLayoutPreferencesStore = create<LayoutPreferencesState>((set) => ({
  isWide: false,
  setWide: (wide) => set({ isWide: wide }),
}));
