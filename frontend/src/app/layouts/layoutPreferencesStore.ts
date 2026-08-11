/**
 * Estado global mínimo para que una página le pida a `AppLayout` un `<main>` más ancho
 * que el `max-w-5xl` por default (Épica 9, Etapa 4 -- rediseño de Sala del Remate).
 * Mismo patrón que `breadcrumbStore.ts`: Zustand sin persistencia, la página setea su
 * preferencia vía `useWideLayout` (ver ese archivo), `AppLayout` es el único que la lee.
 *
 * `isFocusMode` (Épica 9 -- "Modo Remate" de la Consola Operativa): igual patrón, pero
 * para pedir que `AppLayout` oculte por completo `Sidebar`/`Header`, no solo que ensanche
 * el `<main>`. Ver `useFocusMode.ts`.
 */

import { create } from 'zustand';

interface LayoutPreferencesState {
  isWide: boolean;
  setWide: (wide: boolean) => void;
  isFocusMode: boolean;
  setFocusMode: (focus: boolean) => void;
}

export const useLayoutPreferencesStore = create<LayoutPreferencesState>((set) => ({
  isWide: false,
  setWide: (wide) => set({ isWide: wide }),
  isFocusMode: false,
  setFocusMode: (focus) => set({ isFocusMode: focus }),
}));
