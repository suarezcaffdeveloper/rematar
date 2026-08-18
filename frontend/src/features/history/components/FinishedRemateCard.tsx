import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge } from '../../../shared/components/Badge';
import { formatCurrency, formatDateTimeCompact, formatDuration } from '../../../shared/lib/format';
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
 * lotes vendidos, monto adjudicado, compradores participantes, duración total. Mismo
 * lenguaje visual que `CaseCard` (post-remate) y `RematadorRemateCard` (rediseño Épica 9):
 * monto destacado en su propio bloque, un único `<dl>` de estadísticas sin líneas que se
 * pisen, y el CTA como única pieza interactiva al pie -- antes el valor adjudicado y las
 * demás métricas competían por el mismo tamaño de fuente y se apretaban en una grilla de
 * 4 columnas donde el texto largo (montos, "vendidos") se solapaba en pantallas chicas.
 */
export function FinishedRemateCard({ remate, showOwner = false, currency = 'ARS' }: FinishedRemateCardProps) {
  const soldPercent = remate.lote_count > 0 ? Math.round((remate.lotes_sold_count / remate.lote_count) * 100) : 0;

  return (
    <Link
      to={`/remates/${remate.id}/historial`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-line-strong hover:shadow-xl"
    >
      <div className="flex flex-1 flex-col gap-4 p-5">
        <div>
          <h3 className="break-words text-base font-semibold leading-snug text-ink">{remate.title}</h3>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-muted">
            <span>{CATEGORY_LABELS[remate.category]}</span>
            {showOwner && remate.owner_name && <span>· {remate.owner_name}</span>}
            {remate.resolved_at && (
              <>
                <span className="text-ink-faint">·</span>
                <span>{formatDateTimeCompact(remate.resolved_at)}</span>
              </>
            )}
            {/* "Finalizado" no se muestra -- todas las tarjetas de este listado ya son
                remates terminados, así que sería redundante; "Cancelado" sí se muestra,
                es la única distinción de estado que aporta algo acá. */}
            {remate.status !== 'finished' && (
              <Badge variant={STATUS_BADGE_VARIANTS[remate.status]} className="ml-auto">
                {STATUS_LABELS[remate.status]}
              </Badge>
            )}
          </div>
        </div>

        <div className="flex flex-col items-center border-t border-line pt-4 text-center">
          <span className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Valor adjudicado</span>
          <span className="text-2xl font-bold text-brand-600">
            {formatCurrency(remate.total_awarded_value, currency)}
          </span>
        </div>

        <dl className="border-t border-line pt-4 text-sm">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <dt className="text-xs font-medium uppercase tracking-wide text-ink-faint">Lotes</dt>
            <dd className="font-semibold text-ink">
              {remate.lotes_sold_count}/{remate.lote_count}
            </dd>
            <span className="text-xs text-ink-faint">{soldPercent}% vendidos</span>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3 border-t border-line pt-3">
            <div className="flex min-w-0 flex-col gap-1">
              <dt className="text-xs font-medium uppercase tracking-wide text-ink-faint">Compradores</dt>
              <dd className="font-semibold text-ink">{remate.buyer_count}</dd>
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <dt className="text-xs font-medium uppercase tracking-wide text-ink-faint">Duración</dt>
              <dd className="font-semibold text-ink">
                {remate.duration_seconds != null ? formatDuration(remate.duration_seconds * 1000) : '—'}
              </dd>
            </div>
          </div>
        </dl>

        <div className="mt-auto flex items-center justify-end gap-1 border-t border-line pt-3 text-sm font-medium text-brand-600 transition-colors group-hover:text-brand-700">
          Ver resumen
          <ArrowRight aria-hidden="true" className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </div>
      </div>
    </Link>
  );
}
