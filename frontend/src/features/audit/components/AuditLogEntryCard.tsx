import { useState } from 'react';
import { Badge } from '../../../shared/components/Badge';
import { formatTime } from '../../../shared/lib/format';
import { describeAction, describeResourceType } from '../labels';
import type { AuditLogEntry } from '../types';
import { ChevronDownIcon } from './icons';

export interface AuditLogEntryCardProps {
  entry: AuditLogEntry;
}

/**
 * Una entrada del log de auditoría, en tarjeta -- diseño pedido explícitamente por el
 * enunciado ("tarjetas y una línea de tiempo", "evitar tablas excesivamente cargadas").
 * El detalle (`entry.details`, JSON libre por acción -- ver `app/audit/repository.py`
 * del backend) queda colapsado por defecto: la mayoría de las entradas se escanean por
 * hora + acción + actor, no por su detalle completo.
 */
export function AuditLogEntryCard({ entry }: AuditLogEntryCardProps) {
  const [expanded, setExpanded] = useState(false);
  const { label, variant } = describeAction(entry.action);
  const hasDetails = entry.details && Object.keys(entry.details).length > 0;

  return (
    <div className="flex gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex w-14 shrink-0 flex-col items-center pt-0.5 text-xs font-medium text-slate-500">
        {formatTime(entry.occurred_at)}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={variant}>{label}</Badge>
          <span className="text-xs text-slate-400">{describeResourceType(entry.resource_type)}</span>
        </div>

        <p className="text-sm text-slate-700">
          <span className="font-medium text-slate-900">{entry.actor_name ?? 'Sistema'}</span>
          {entry.actor_role && <span className="text-slate-400"> · {entry.actor_role}</span>}
        </p>

        {hasDetails && (
          <div>
            <button
              type="button"
              onClick={() => setExpanded((prev) => !prev)}
              className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
            >
              <ChevronDownIcon className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
              {expanded ? 'Ocultar detalle' : 'Ver detalle'}
            </button>
            {expanded && (
              <dl className="mt-2 flex flex-col gap-1 rounded-md bg-slate-50 p-2 text-xs text-slate-600">
                {Object.entries(entry.details ?? {}).map(([key, value]) => (
                  <div key={key} className="flex gap-2">
                    <dt className="shrink-0 font-medium text-slate-500">{key}:</dt>
                    <dd className="break-all">{value === null ? '—' : String(value)}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
