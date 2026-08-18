import { useState } from 'react';
import { Activity, DollarSign, Gavel, LogIn, MessageSquare, Package, ShieldAlert, Truck } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Badge } from '../../../shared/components/Badge';
import { formatTime } from '../../../shared/lib/format';
import { describeAction, describeResourceType } from '../labels';
import type { AuditActionLabel } from '../labels';
import type { AuditLogEntry } from '../types';
import { ChevronDownIcon } from './icons';

export interface AuditLogEntryCardProps {
  entry: AuditLogEntry;
}

/** Ícono por categoría de acción (`"dominio.verbo"` -> `"dominio"`) -- pura señal visual
 * para escanear la línea de tiempo de un vistazo, el texto (`describeAction`) sigue
 * siendo la fuente de verdad de qué pasó. `Activity` es el fallback para un dominio
 * nuevo que todavía no tiene ícono asignado acá (nunca rompe, igual que `describeAction`). */
const CATEGORY_ICONS: Record<string, LucideIcon> = {
  auth: LogIn,
  remate: Gavel,
  lote: Package,
  oferta: DollarSign,
  chat: MessageSquare,
  moderacion: ShieldAlert,
  postauction: Truck,
};

const VARIANT_ICON_CLASSES: Record<AuditActionLabel['variant'], string> = {
  brand: 'bg-brand-50 text-brand-600',
  success: 'bg-success-50 text-success-600',
  danger: 'bg-danger-50 text-danger-600',
  warning: 'bg-warning-50 text-warning-600',
  neutral: 'bg-slate-100 text-slate-500',
};

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
  const CategoryIcon = CATEGORY_ICONS[entry.action.split('.')[0]] ?? Activity;

  return (
    <div className="flex gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${VARIANT_ICON_CLASSES[variant]}`}
      >
        <CategoryIcon aria-hidden="true" className="h-4 w-4" />
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={variant}>{label}</Badge>
          <span className="text-xs text-slate-400">{describeResourceType(entry.resource_type)}</span>
          <span className="ml-auto shrink-0 text-xs font-medium text-slate-500">
            {formatTime(entry.occurred_at)}
          </span>
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
              <dl className="mt-2 flex flex-col gap-1 rounded-lg bg-slate-50 p-2 text-xs text-slate-600">
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
