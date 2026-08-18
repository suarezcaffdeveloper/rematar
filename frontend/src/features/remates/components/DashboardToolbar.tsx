import { CATEGORY_LABELS, CATEGORY_OPTIONS, STATUS_LABELS, VISIBLE_STATUS_OPTIONS } from '../labels';
import type { RemateFilters, RemateSortOption } from '../filtering';
import type { RemateCategory, RemateStatus } from '../types';
import { SearchIcon } from './icons';

export interface DashboardToolbarProps {
  filters: RemateFilters;
  onChange: (filters: RemateFilters) => void;
  /** Opciones del filtro de estado -- default `VISIBLE_STATUS_OPTIONS` (sin `draft`,
   * lo que ya usaba `CompradorDashboardPage`). El Dashboard del Rematador (Épica 5,
   * Módulo 5.1) pasa `ALL_STATUS_OPTIONS` para poder filtrar también sus borradores. */
  statusOptions?: RemateStatus[];
  /** `'boxed'` (default, sin cambios): caja blanca con borde/sombra -- lo que ya usaba
   * el Dashboard del Rematador, que no pasa esta prop. `'open'`: composición abierta con
   * tokens `ink`/`line` (rediseño visual del Dashboard del Comprador -- ver prototipo
   * aprobado de la Sala del Remate, mismo lenguaje). Un solo componente para las dos
   * pantallas en vez de duplicar el cableado de filtros. */
  variant?: 'boxed' | 'open';
}

const SORT_LABELS: Record<RemateSortOption, string> = {
  proximos: 'Próximos primero',
  recientes: 'Más recientes',
  en_vivo: 'En vivo primero',
};

const WRAPPER_CLASSES: Record<'boxed' | 'open', string> = {
  boxed: 'flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm',
  open: 'flex flex-col gap-3',
};

const SEARCH_WRAPPER_CLASSES: Record<'boxed' | 'open', string> = {
  boxed: 'relative',
  open: 'relative border-b border-line-strong transition-colors focus-within:border-brand-600',
};

const SEARCH_ICON_CLASSES: Record<'boxed' | 'open', string> = {
  boxed: 'pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400',
  open: 'pointer-events-none absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint',
};

const SEARCH_INPUT_CLASSES: Record<'boxed' | 'open', string> = {
  boxed:
    'w-full rounded-md border border-slate-300 py-2 pl-9 pr-3 text-sm shadow-sm focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500',
  open: 'w-full border-0 bg-transparent py-2 pl-6 pr-2 text-sm text-ink placeholder:text-ink-faint focus:outline-none',
};

const SELECT_CLASSES: Record<'boxed' | 'open', string> = {
  boxed:
    'rounded-md border border-slate-300 bg-white py-2 pl-3 pr-8 text-sm text-slate-700 shadow-sm ' +
    'focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500',
  open:
    'rounded-lg border border-line bg-white py-2 pl-3 pr-8 text-sm text-ink-muted shadow-sm ' +
    'focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500',
};

/**
 * Barra de búsqueda + filtros + orden del dashboard. Controlado por el padre
 * (`CompradorDashboardPage`/`RematadorDashboardPage`), que es quien conoce la lista
 * completa a filtrar -- este componente no sabe nada de remates cargados, solo edita el
 * objeto `RemateFilters`.
 *
 * Layout de dos filas (refinamiento visual, pedido explícito): buscador solo, a ancho
 * completo, arriba -- es el control que más se usa y el que antes competía por espacio
 * con los tres `<select>` en una sola fila `lg:flex-row`, quedando angosto en pantallas
 * medianas. Categoría/Estado/Orden abajo, en ese orden, en grilla de 3 columnas desde
 * `sm:` (una debajo de la otra en mobile).
 */
export function DashboardToolbar({
  filters,
  onChange,
  statusOptions = VISIBLE_STATUS_OPTIONS,
  variant = 'boxed',
}: DashboardToolbarProps) {
  return (
    <div className={WRAPPER_CLASSES[variant]}>
      <div className={SEARCH_WRAPPER_CLASSES[variant]}>
        <SearchIcon className={SEARCH_ICON_CLASSES[variant]} />
        <input
          type="search"
          value={filters.search}
          onChange={(event) => onChange({ ...filters, search: event.target.value })}
          placeholder="Buscar remates por título…"
          aria-label="Buscar remates por título"
          className={SEARCH_INPUT_CLASSES[variant]}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <select
          aria-label="Filtrar por categoría"
          value={filters.category}
          onChange={(event) =>
            onChange({ ...filters, category: event.target.value as RemateCategory | 'all' })
          }
          className={SELECT_CLASSES[variant]}
        >
          <option value="all">Todas las categorías</option>
          {CATEGORY_OPTIONS.map((category) => (
            <option key={category} value={category}>
              {CATEGORY_LABELS[category]}
            </option>
          ))}
        </select>

        <select
          aria-label="Filtrar por estado"
          value={filters.status}
          onChange={(event) =>
            onChange({ ...filters, status: event.target.value as RemateStatus | 'all' })
          }
          className={SELECT_CLASSES[variant]}
        >
          <option value="all">Todos los estados</option>
          {statusOptions.map((status) => (
            <option key={status} value={status}>
              {STATUS_LABELS[status]}
            </option>
          ))}
        </select>

        <select
          aria-label="Ordenar remates"
          value={filters.sort}
          onChange={(event) => onChange({ ...filters, sort: event.target.value as RemateSortOption })}
          className={SELECT_CLASSES[variant]}
        >
          {(Object.keys(SORT_LABELS) as RemateSortOption[]).map((sort) => (
            <option key={sort} value={sort}>
              {SORT_LABELS[sort]}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
