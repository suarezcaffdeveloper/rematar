import { Link } from 'react-router-dom';
import { Badge } from '../../../shared/components/Badge';
import { formatCurrency, formatDateTime, formatDuration } from '../../../shared/lib/format';
import { CATEGORY_LABELS, STATUS_BADGE_VARIANTS, STATUS_LABELS } from '../../remates/labels';
import type { FinishedRemateSummary } from '../types';

export interface FinishedRemateCardProps {
  remate: FinishedRemateSummary;
  /** `true` en el panel global del admin -- muestra a quién pertenece el remate. En el
   * listado del rematador (siempre remates propios) sería ruido. */
  showOwner?: boolean;
  /** Moneda para formatear `total_awarded_value` -- `FinishedRemateSummary` no la trae
   * (no es un campo de `Remate.settings` que este listado agregado exponga), así que se
   * recibe un valor razonable por defecto desde quien arma la lista. */
  currency?: string;
}

/**
 * Tarjeta de un remate finalizado/cancelado (Épica 7, Módulo 7.3) -- KPIs resumidos,
 * pedidos explícitamente por el enunciado: nombre, fecha, estado, cantidad de lotes,
 * lotes vendidos, monto adjudicado, compradores participantes, duración total.
 */
export function FinishedRemateCard({ remate, showOwner = false, currency = 'ARS' }: FinishedRemateCardProps) {
  return (
    <Link
      to={`/remates/${remate.id}/historial`}
      className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:border-brand-300 hover:bg-brand-50/30"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold text-slate-900">{remate.title}</h3>
          <p className="text-xs text-slate-500">
            {CATEGORY_LABELS[remate.category]}
            {showOwner && remate.owner_name && <span> · {remate.owner_name}</span>}
          </p>
        </div>
        <Badge variant={STATUS_BADGE_VARIANTS[remate.status]}>{STATUS_LABELS[remate.status]}</Badge>
      </div>

      {remate.resolved_at && (
        <p className="text-xs text-slate-500">{formatDateTime(remate.resolved_at)}</p>
      )}

      <div className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 text-sm sm:grid-cols-4">
        <div className="flex flex-col">
          <span className="text-xs text-slate-500">Lotes</span>
          <span className="font-medium text-slate-900">
            {remate.lotes_sold_count}/{remate.lote_count} vendidos
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-xs text-slate-500">Adjudicado</span>
          <span className="font-medium text-slate-900">
            {formatCurrency(remate.total_awarded_value, currency)}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-xs text-slate-500">Compradores</span>
          <span className="font-medium text-slate-900">{remate.buyer_count}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-xs text-slate-500">Duración</span>
          <span className="font-medium text-slate-900">
            {remate.duration_seconds != null ? formatDuration(remate.duration_seconds * 1000) : '—'}
          </span>
        </div>
      </div>
    </Link>
  );
}
