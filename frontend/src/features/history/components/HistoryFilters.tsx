import { Button } from '../../../shared/components/Button';
import { Input } from '../../../shared/components/Input';
import { Select } from '../../../shared/components/Select';
import type { HistoryListFilters, HistorySortOption } from '../types';

export interface HistoryFiltersProps {
  value: HistoryListFilters;
  onChange: (value: HistoryListFilters) => void;
}

const SORT_LABELS: Record<HistorySortOption, string> = {
  date_desc: 'Más reciente primero',
  date_asc: 'Más antiguo primero',
  title_asc: 'Título (A-Z)',
  title_desc: 'Título (Z-A)',
  amount_desc: 'Monto adjudicado (mayor a menor)',
  amount_asc: 'Monto adjudicado (menor a mayor)',
};

/** Filtros del listado de historial (Épica 7, Módulo 7.3): búsqueda por título, rango
 * de fechas y orden -- mismo patrón visual que `AuditLogFilters`
 * (`features/audit/components/`). */
export function HistoryFilters({ value, onChange }: HistoryFiltersProps) {
  function set<K extends keyof HistoryListFilters>(key: K, next: HistoryListFilters[K]) {
    onChange({ ...value, [key]: next || undefined });
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:flex-wrap sm:items-end">
      <div className="min-w-[220px] flex-1">
        <Input
          label="Buscar por título"
          placeholder="Nombre del remate"
          value={value.search ?? ''}
          onChange={(e) => set('search', e.target.value)}
        />
      </div>

      <div className="min-w-[170px]">
        <Input
          label="Desde"
          type="date"
          value={value.date_from?.slice(0, 10) ?? ''}
          onChange={(e) => set('date_from', e.target.value ? `${e.target.value}T00:00:00Z` : undefined)}
        />
      </div>

      <div className="min-w-[170px]">
        <Input
          label="Hasta"
          type="date"
          value={value.date_to?.slice(0, 10) ?? ''}
          onChange={(e) => set('date_to', e.target.value ? `${e.target.value}T23:59:59Z` : undefined)}
        />
      </div>

      <div className="min-w-[220px]">
        <Select
          label="Orden"
          value={value.sort ?? 'date_desc'}
          onChange={(e) => set('sort', e.target.value as HistorySortOption)}
        >
          {Object.entries(SORT_LABELS).map(([option, label]) => (
            <option key={option} value={option}>
              {label}
            </option>
          ))}
        </Select>
      </div>

      {(value.search || value.date_from || value.date_to) && (
        <Button variant="ghost" onClick={() => onChange({ sort: value.sort })}>
          Limpiar filtros
        </Button>
      )}
    </div>
  );
}
