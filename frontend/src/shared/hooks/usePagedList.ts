import { useEffect, useMemo, useState } from 'react';

export interface UsePagedListResult<T> {
  page: number;
  totalPages: number;
  pageItems: T[];
  goToPage: (page: number) => void;
  resetPage: () => void;
}

/**
 * Paginación client-side sobre una lista que ya está filtrada/ordenada en memoria (mismo
 * criterio que `filterAndSortRemates`: el backend no expone paginación real acá). Si la
 * lista se achica (nuevo filtro, reload) y la página actual queda fuera de rango, se
 * ajusta sola a la última página válida en vez de mostrar una grilla vacía.
 */
export function usePagedList<T>(items: T[], pageSize: number): UsePagedListResult<T> {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const pageItems = useMemo(
    () => items.slice((page - 1) * pageSize, page * pageSize),
    [items, page, pageSize],
  );

  return { page, totalPages, pageItems, goToPage: setPage, resetPage: () => setPage(1) };
}
