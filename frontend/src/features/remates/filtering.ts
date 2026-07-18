/**
 * Búsqueda, filtro y orden del dashboard -- todo client-side, sobre la lista completa ya
 * cargada (ver `hooks.ts::useRemates`). El backend no expone búsqueda de texto en
 * `GET /remates` (confirmado leyendo `app/modules/remates/router.py`: solo acepta
 * `category`, `status` y `owner_id`), así que no hay forma de delegarla al servidor sin
 * tocar el backend -- explícitamente fuera de alcance de este módulo. Función pura y
 * sin estado a propósito: se puede testear sin montar nada de React.
 */

import type { Remate, RemateCategory, RemateStatus } from './types';

export type RemateSortOption = 'proximos' | 'recientes' | 'en_vivo';

export interface RemateFilters {
  search: string;
  // `RemateStatus` completo (no solo `VisibleRemateStatus`) -- el Dashboard del
  // Rematador (Épica 5, Módulo 5.1) necesita poder filtrar también por `draft`, algo
  // que un comprador nunca ve. `CompradorDashboardPage` sigue sin ofrecer esa opción:
  // el tipo lo permite, pero `DashboardToolbar` solo la lista si se le pasan
  // `ALL_STATUS_OPTIONS` (ver `labels.ts`).
  status: RemateStatus | 'all';
  category: RemateCategory | 'all';
  sort: RemateSortOption;
}

export const DEFAULT_FILTERS: RemateFilters = {
  search: '',
  status: 'all',
  category: 'all',
  sort: 'proximos',
};

function matchesSearch(remate: Remate, search: string): boolean {
  const normalized = search.trim().toLowerCase();
  if (!normalized) return true;
  return remate.title.toLowerCase().includes(normalized);
}

function compareByStartsAtAscending(a: Remate, b: Remate): number {
  // Sin fecha programada todavía (remate en DRAFT que un dueño/admin ve pero un
  // comprador no debería llegar a tener acá) va al final, no al principio.
  const aTime = a.starts_at ? new Date(a.starts_at).getTime() : Infinity;
  const bTime = b.starts_at ? new Date(b.starts_at).getTime() : Infinity;
  return aTime - bTime;
}

function compareByCreatedAtDescending(a: Remate, b: Remate): number {
  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
}

function sortRemates(remates: Remate[], sort: RemateSortOption): Remate[] {
  const sorted = [...remates];
  switch (sort) {
    case 'proximos':
      return sorted.sort(compareByStartsAtAscending);
    case 'recientes':
      return sorted.sort(compareByCreatedAtDescending);
    case 'en_vivo':
      // Los "en vivo" primero (estable entre sí por starts_at), el resto detrás.
      return sorted.sort((a, b) => {
        const aLive = a.status === 'live' ? 0 : 1;
        const bLive = b.status === 'live' ? 0 : 1;
        if (aLive !== bLive) return aLive - bLive;
        return compareByStartsAtAscending(a, b);
      });
  }
}

export function filterAndSortRemates(remates: Remate[], filters: RemateFilters): Remate[] {
  const filtered = remates.filter(
    (remate) =>
      matchesSearch(remate, filters.search) &&
      (filters.status === 'all' || remate.status === filters.status) &&
      (filters.category === 'all' || remate.category === filters.category),
  );
  return sortRemates(filtered, filters.sort);
}
