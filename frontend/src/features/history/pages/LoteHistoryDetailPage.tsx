import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Alert } from '../../../shared/components/Alert';
import { Badge } from '../../../shared/components/Badge';
import { Breadcrumb } from '../../../shared/components/Breadcrumb';
import { Button } from '../../../shared/components/Button';
import { Card } from '../../../shared/components/Card';
import { EmptyState } from '../../../shared/components/EmptyState';
import { Skeleton } from '../../../shared/components/Skeleton';
import { formatCurrency, formatDateTime, formatDuration } from '../../../shared/lib/format';
import { LOTE_STATUS_BADGE_VARIANTS, LOTE_STATUS_LABELS } from '../../remates/labels';
import { useRemateDetail } from '../../remates/hooks';
import { useLoteHistoryDetail } from '../hooks';
import { PersonIcon } from '../../remates/components/icons';

const PAGE_SIZE = 20;

const OFERTA_STATUS_LABELS: Record<string, string> = {
  accepted: 'Aceptada',
  rejected: 'Rechazada',
  outbid: 'Superada',
  winning: 'Ganadora',
};

/**
 * Detalle histórico de un lote (Épica 7, Módulo 7.3), en
 * `/remates/:remateId/historial/lotes/:loteId`: ganador, precio inicial/final, cantidad
 * de ofertas, tiempo abierto, historial de ofertas completo (paginado). Ver
 * docs/37-historial-y-resultados-de-remates.md.
 */
export function LoteHistoryDetailPage() {
  const { remateId, loteId } = useParams<{ remateId: string; loteId: string }>();
  const navigate = useNavigate();
  const rId = remateId ?? '';
  const lId = loteId ?? '';
  const [page, setPage] = useState(1);

  const { remate, isLoading: isRemateLoading } = useRemateDetail(rId);
  const { data, isLoading, error } = useLoteHistoryDetail(rId, lId, page, PAGE_SIZE);

  if (isLoading || isRemateLoading) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-4 w-64" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col gap-6">
        <Breadcrumb items={[{ label: 'Mis remates', to: '/' }, { label: 'Lote no encontrado' }]} />
        <Alert variant="error">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{error?.message ?? 'No se pudo cargar el historial de este lote.'}</span>
            <Button variant="secondary" onClick={() => navigate(`/remates/${rId}/historial`)}>
              Volver al historial
            </Button>
          </div>
        </Alert>
      </div>
    );
  }

  const currency = remate?.settings.currency ?? 'ARS';
  const totalPages = Math.max(1, Math.ceil(data.offer_history.total / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumb
        items={[
          { label: 'Mis remates', to: '/' },
          { label: remate?.title ?? 'Remate', to: `/remates/${rId}/historial` },
          { label: `Lote ${data.lot_number}` },
        ]}
      />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            Lote {data.lot_number} -- {data.title}
          </h1>
        </div>
        <Badge variant={LOTE_STATUS_BADGE_VARIANTS[data.status]}>{LOTE_STATUS_LABELS[data.status]}</Badge>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <span className="text-xs text-slate-500">Precio inicial</span>
          <p className="mt-1 text-lg font-semibold text-slate-900">
            {formatCurrency(data.base_price, currency)}
          </p>
        </Card>
        <Card>
          <span className="text-xs text-slate-500">Precio final</span>
          <p className="mt-1 text-lg font-semibold text-slate-900">
            {data.final_price ? formatCurrency(data.final_price, currency) : '—'}
          </p>
        </Card>
        <Card>
          <span className="text-xs text-slate-500">Ofertas recibidas</span>
          <p className="mt-1 text-lg font-semibold text-slate-900">{data.offer_count}</p>
        </Card>
        <Card>
          <span className="text-xs text-slate-500">Tiempo abierto</span>
          <p className="mt-1 text-lg font-semibold text-slate-900">
            {data.time_open_seconds != null ? formatDuration(data.time_open_seconds * 1000) : '—'}
          </p>
        </Card>
      </div>

      <Card>
        <div className="flex items-center gap-2">
          <PersonIcon className="h-4 w-4 text-slate-400" />
          <h3 className="text-sm font-semibold text-slate-800">Ganador</h3>
        </div>
        {data.winner ? (
          <p className="mt-2 text-sm text-slate-700">
            <span className="font-medium text-slate-900">{data.winner.buyer_name ?? 'Comprador'}</span>
            <span className="ml-2 text-slate-500">{formatCurrency(data.winner.amount, currency)}</span>
          </p>
        ) : (
          <p className="mt-2 text-sm text-slate-400">
            {data.status === 'closed_sold'
              ? 'Marcado como vendido sin una oferta que identifique al comprador.'
              : 'Este lote no tiene un ganador.'}
          </p>
        )}
      </Card>

      {data.cancellation_reason && (
        <Alert variant="error">Cancelado: {data.cancellation_reason}</Alert>
      )}

      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-slate-900">Historial de ofertas</h2>

        {data.offer_history.items.length === 0 ? (
          <EmptyState title="Sin ofertas" description="Este lote no recibió ofertas." />
        ) : (
          <div className="flex flex-col gap-2">
            {data.offer_history.items.map((oferta) => (
              <div
                key={oferta.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white p-3 text-sm shadow-sm"
              >
                <div className="flex flex-col">
                  <span className="font-medium text-slate-900">
                    {oferta.buyer_name ?? 'Comprador'}
                  </span>
                  <span className="text-xs text-slate-500">{formatDateTime(oferta.created_at)}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-slate-900">
                    {formatCurrency(oferta.amount, currency)}
                  </span>
                  <Badge variant={oferta.status === 'rejected' ? 'danger' : 'neutral'}>
                    {OFERTA_STATUS_LABELS[oferta.status] ?? oferta.status}
                  </Badge>
                </div>
                {oferta.rejection_reason && (
                  <p className="w-full text-xs text-danger-600">{oferta.rejection_reason}</p>
                )}
              </div>
            ))}
          </div>
        )}

        {data.offer_history.total > PAGE_SIZE && (
          <div className="flex items-center justify-between border-t border-slate-200 pt-3">
            <span className="text-xs text-slate-500">
              {data.offer_history.total} ofertas · página {page} de {totalPages}
            </span>
            <div className="flex gap-2">
              <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                Anterior
              </Button>
              <Button
                variant="secondary"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Siguiente
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
