import { Button } from '../../../shared/components/Button';
import { Input } from '../../../shared/components/Input';
import { Select } from '../../../shared/components/Select';
import { ACTION_FILTER_OPTIONS, describeAction } from '../labels';
import type { AuditLogFilters as AuditLogFiltersValue } from '../types';

export interface AuditLogFiltersProps {
  value: AuditLogFiltersValue;
  onChange: (value: AuditLogFiltersValue) => void;
}

/**
 * Barra de filtros del panel de auditoría (Épica 7, Módulo 7.2): búsqueda por nombre de
 * actor, tipo de acción, tipo de recurso y rango de fechas. Controlado desde
 * `AuditLogView` -- este componente no sabe nada de scope ni de paginación, solo emite
 * el `AuditLogFilters` completo en cada cambio. Sin selector de actor por id: no hay
 * (todavía) un picker de usuarios en la app -- la búsqueda por nombre (`search`, `ILIKE`
 * en el backend) cubre el mismo caso de uso sin esa pieza nueva.
 */
export function AuditLogFilters({ value, onChange }: AuditLogFiltersProps) {
  function set<K extends keyof AuditLogFiltersValue>(key: K, next: AuditLogFiltersValue[K]) {
    onChange({ ...value, [key]: next || undefined });
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:flex-wrap sm:items-end">
      <div className="min-w-[220px] flex-1">
        <Input
          label="Buscar por usuario"
          placeholder="Nombre del usuario responsable"
          value={value.search ?? ''}
          onChange={(e) => set('search', e.target.value)}
        />
      </div>

      <div className="min-w-[200px]">
        <Select
          label="Tipo de acción"
          value={value.action ?? ''}
          onChange={(e) => set('action', e.target.value)}
        >
          <option value="">Todas</option>
          {ACTION_FILTER_OPTIONS.map((action) => (
            <option key={action} value={action}>
              {describeAction(action).label}
            </option>
          ))}
        </Select>
      </div>

      <div className="min-w-[160px]">
        <Select
          label="Tipo de recurso"
          value={value.resource_type ?? ''}
          onChange={(e) => set('resource_type', e.target.value)}
        >
          <option value="">Todos</option>
          <option value="remate">Remate</option>
          <option value="lote">Lote</option>
          <option value="oferta">Oferta</option>
          <option value="chat_message">Mensaje de chat</option>
          <option value="user">Usuario</option>
        </Select>
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

      <div className="min-w-[150px]">
        <Select
          label="Orden"
          value={value.sort ?? 'desc'}
          onChange={(e) => set('sort', e.target.value as 'asc' | 'desc')}
        >
          <option value="desc">Más reciente primero</option>
          <option value="asc">Más antiguo primero</option>
        </Select>
      </div>

      {(value.search || value.action || value.resource_type || value.date_from || value.date_to || value.actor_id) && (
        <Button variant="ghost" onClick={() => onChange({ sort: value.sort })}>
          Limpiar filtros
        </Button>
      )}
    </div>
  );
}
