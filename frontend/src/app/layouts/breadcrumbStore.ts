/**
 * Estado global mínimo para que el `Header` (Épica 9, Etapa 2 -- rediseño) renderice el
 * breadcrumb una única vez, con la página actual seteando sus propios items -- mismo
 * criterio que `useToastStore`/`useAuthStore` (Zustand, sin persistencia). Antes cada
 * página renderizaba su propio `<Breadcrumb>` en el cuerpo de la pantalla; ahora solo
 * declara sus items vía `useBreadcrumb` (ver ese archivo) y el `Header` es el único que
 * efectivamente lo dibuja.
 */

import { create } from 'zustand';
import type { BreadcrumbItem } from '../../shared/components/Breadcrumb';

interface BreadcrumbState {
  items: BreadcrumbItem[];
  setItems: (items: BreadcrumbItem[]) => void;
}

export const useBreadcrumbStore = create<BreadcrumbState>((set) => ({
  items: [],
  setItems: (items) => set({ items }),
}));
