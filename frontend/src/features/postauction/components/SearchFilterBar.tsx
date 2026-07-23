import { Button } from '../../../shared/components/Button';
import { Input } from '../../../shared/components/Input';
import { Select } from '../../../shared/components/Select';
import { STATUS_LABELS, STATUS_ORDER } from '../labels';
import type { PostAuctionListFilters } from '../types';

export interface SearchFilterBarProps {
  value: PostAuctionListFilters;
  onChange: (value: PostAuctionListFilters) => void;
}

/** Buscar y filtrar por estado (pedido explícito del enunciado, sección Rematador) --
 * mismo patrón visual que `HistoryFilters` (`features/history/components/`). */
export function SearchFilterBar({ value, onChange }: SearchFilterBarProps) {
  function set<K extends keyof PostAuctionListFilters>(key: K, next: PostAuctionListFilters[K]) {
    onChange({ ...value, [key]: next || undefined });
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:flex-wrap sm:items-end">
      <div className="min-w-[220px] flex-1">
        <Input
          label="Buscar"
          placeholder="Lote, número o comprador"
          value={value.search ?? ''}
          onChange={(e) => set('search', e.target.value)}
        />
      </div>

      <div className="min-w-[220px]">
        <Select
          label="Estado"
          value={value.status ?? ''}
          onChange={(e) => set('status', (e.target.value || undefined) as PostAuctionListFilters['status'])}
        >
          <option value="">Todos los estados</option>
          {STATUS_ORDER.map((status) => (
            <option key={status} value={status}>
              {STATUS_LABELS[status]}
            </option>
          ))}
        </Select>
      </div>

      {(value.search || value.status) && (
        <Button variant="ghost" onClick={() => onChange({})}>
          Limpiar filtros
        </Button>
      )}
    </div>
  );
}
