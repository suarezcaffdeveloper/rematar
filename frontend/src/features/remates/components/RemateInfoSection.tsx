import { Card } from '../../../shared/components/Card';
import { formatDateTime } from '../../../shared/lib/format';
import type { Remate } from '../types';
import { BoxIcon, CalendarIcon, PersonIcon, PinIcon } from './icons';

export interface RemateInfoSectionProps {
  remate: Remate;
  loteTotal: number;
}

function DetailRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 text-slate-400">{icon}</span>
      <div className="min-w-0">
        <dt className="text-xs text-slate-400">{label}</dt>
        <dd className="text-sm text-slate-700">{children}</dd>
      </div>
    </div>
  );
}

/**
 * Descripción + panel de detalles del remate. El rematador dueño (`owner_id`) no se
 * puede resolver a un nombre con los endpoints existentes (no hay `GET /users/{id}`
 * para un comprador, `GET /users` es solo-admin -- mismo hueco ya documentado en
 * docs/25-dashboard-comprador.md) -- se muestra como "Rematador verificado" con un
 * fragmento del id en vez de inventar o esconder el campo por completo, que el
 * enunciado de este módulo pide mostrar.
 */
export function RemateInfoSection({ remate, loteTotal }: RemateInfoSectionProps) {
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <h2 className="text-base font-semibold text-slate-900">Descripción</h2>
        <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-600">
          {remate.description ?? 'Este remate todavía no tiene una descripción cargada.'}
        </p>
      </Card>

      <Card>
        <h2 className="text-base font-semibold text-slate-900">Detalles</h2>
        <dl className="mt-3 flex flex-col gap-3.5">
          {remate.starts_at && (
            <DetailRow icon={<CalendarIcon className="h-4 w-4" />} label="Fecha y hora de inicio">
              {formatDateTime(remate.starts_at)}
            </DetailRow>
          )}
          {remate.location && (
            <DetailRow icon={<PinIcon className="h-4 w-4" />} label="Ubicación">
              {remate.location}
            </DetailRow>
          )}
          <DetailRow icon={<PersonIcon className="h-4 w-4" />} label="Rematador">
            Rematador verificado
            <span className="mt-0.5 block font-mono text-xs text-slate-400">
              ID {remate.owner_id.slice(0, 8)}
            </span>
          </DetailRow>
          <DetailRow icon={<BoxIcon className="h-4 w-4" />} label="Lotes">
            {loteTotal} {loteTotal === 1 ? 'lote' : 'lotes'}
          </DetailRow>
        </dl>
      </Card>
    </div>
  );
}
