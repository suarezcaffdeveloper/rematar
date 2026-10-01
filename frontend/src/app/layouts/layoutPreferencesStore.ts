/**
 * Estado global mínimo para que una página le pida a `AppLayout` un `<main>` más ancho
 * que el `max-w-5xl` por default (Épica 9, Etapa 4 -- rediseño de Sala del Remate).
 * Mismo patrón que `breadcrumbStore.ts`: Zustand sin persistencia, la página setea su
 * preferencia vía `useWideLayout` (ver ese archivo), `AppLayout` es el único que la lee.
 *
 * `isFocusMode` (Épica 9 -- "Modo Remate" de la Consola Operativa): igual patrón, pero
 * para pedir que `AppLayout` oculte por completo `Sidebar`/`Header`, no solo que ensanche
 * el `<main>`. Ver `useFocusMode.ts`.
 *
 * `isTopNav`: igual patrón -- la página pide que `AppLayout` reemplace `Sidebar` + `Header`
 * por la barra superior `BuyerTopNav` y deje el `<main>` sin ancho ni padding propios (la
 * página arma su propio contenedor). Lo usan las pantallas rediseñadas del comprador. Ver
 * `useTopNavLayout.ts`.
 *
 * `isTopNavStatic`: con `isTopNav`, pide que esa barra sea FIJA AL PRINCIPIO de la página
 * (no sigue el scroll ni se achica a píldora). Es para pantallas de trabajo como la Sala en
 * vivo, donde durante el remate no se navega: para salir se vuelve hacia arriba.
 */

import { create } from 'zustand';

interface LayoutPreferencesState {
  isWide: boolean;
  setWide: (wide: boolean) => void;
  isFocusMode: boolean;
  setFocusMode: (focus: boolean) => void;
  isTopNav: boolean;
  isTopNavStatic: boolean;
  setTopNav: (topNav: boolean, isStatic?: boolean) => void;
}

export const useLayoutPreferencesStore = create<LayoutPreferencesState>((set) => ({
  isWide: false,
  setWide: (wide) => set({ isWide: wide }),
  isFocusMode: false,
  setFocusMode: (focus) => set({ isFocusMode: focus }),
  isTopNav: false,
  isTopNavStatic: false,
  setTopNav: (topNav, isStatic = false) => set({ isTopNav: topNav, isTopNavStatic: topNav && isStatic }),
}));
