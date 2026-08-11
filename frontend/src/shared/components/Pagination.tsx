import { ChevronLeft, ChevronRight } from 'lucide-react';

export interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

type PageItem = number | 'ellipsis';

const EDGE_COUNT = 3;

/** `1 2 3 … 10`, `1 … 4 5 6 … 10` o `1 … 8 9 10` según dónde esté `page` -- nunca un
 * "…" que solo tape un único número (si falta uno solo, se muestra ese número en vez del
 * "…", ver el corte en `totalPages <= EDGE_COUNT + 2`). */
function getPageItems(page: number, totalPages: number): PageItem[] {
  if (totalPages <= EDGE_COUNT + 2) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  if (page <= EDGE_COUNT) {
    return [...Array.from({ length: EDGE_COUNT }, (_, i) => i + 1), 'ellipsis', totalPages];
  }
  if (page > totalPages - EDGE_COUNT) {
    return [
      1,
      'ellipsis',
      ...Array.from({ length: EDGE_COUNT }, (_, i) => totalPages - EDGE_COUNT + 1 + i),
    ];
  }
  return [1, 'ellipsis', page - 1, page, page + 1, 'ellipsis', totalPages];
}

const ARROW_CLASSES =
  'flex h-9 w-9 items-center justify-center rounded-full text-slate-500 transition-colors ' +
  'hover:bg-brand-50 hover:text-brand-600 disabled:pointer-events-none disabled:opacity-40';

/** Paginación numerada con flechas -- mismo azul de marca (`brand-600`) que el resto de
 * la app para la página activa. Client-side: el padre ya tiene la lista completa
 * filtrada/ordenada en memoria (ver `usePagedList`), esto solo dibuja los controles. */
export function Pagination({ page, totalPages, onPageChange }: PaginationProps) {
  if (totalPages <= 1) return null;

  const items = getPageItems(page, totalPages);

  return (
    <nav aria-label="Paginación" className="flex items-center justify-center gap-1">
      <button
        type="button"
        aria-label="Página anterior"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        className={ARROW_CLASSES}
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      </button>

      {items.map((item, index) =>
        item === 'ellipsis' ? (
          <span key={`ellipsis-${index}`} className="px-1.5 text-sm text-slate-400" aria-hidden="true">
            …
          </span>
        ) : (
          <button
            key={item}
            type="button"
            aria-label={`Ir a la página ${item}`}
            aria-current={item === page ? 'page' : undefined}
            onClick={() => onPageChange(item)}
            className={
              item === page
                ? 'flex h-9 w-9 items-center justify-center rounded-full bg-brand-600 text-sm font-semibold text-white shadow-sm'
                : 'flex h-9 w-9 items-center justify-center rounded-full text-sm font-medium text-slate-600 transition-colors hover:bg-brand-50 hover:text-brand-600'
            }
          >
            {item}
          </button>
        ),
      )}

      <button
        type="button"
        aria-label="Página siguiente"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
        className={ARROW_CLASSES}
      >
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </button>
    </nav>
  );
}
