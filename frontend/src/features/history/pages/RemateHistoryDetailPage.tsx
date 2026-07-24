import { useNavigate, useParams } from 'react-router-dom';
import { AuditLogView } from '../../audit/components/AuditLogView';
import { useLotes, useRemateDetail } from '../../remates/hooks';
import { useRemateHistoryDetail } from '../hooks';
import { ChatActivityCard } from '../components/ChatActivityCard';
import { LoteHistoryCard } from '../components/LoteHistoryCard';
import { RemateHistorySummary } from '../components/RemateHistorySummary';
import { useBreadcrumb } from '../../../app/layouts/useBreadcrumb';
import { Alert } from '../../../shared/components/Alert';
import type { BreadcrumbItem } from '../../../shared/components/Breadcrumb';
import { Button } from '../../../shared/components/Button';
import { Skeleton } from '../../../shared/components/Skeleton';

/**
 * Detalle histórico de un remate finalizado/cancelado (Épica 7, Módulo 7.3), en
 * `/remates/:remateId/historial`. Tres fuentes de datos independientes, cada una con su
 * propio estado de carga/error (mismo criterio que `RemateDetailPage`, Épica 4.4):
 * `useRemateDetail` (título/categoría/moneda, reutilizado tal cual), `useRemateHistoryDetail`
 * (métricas finales + actividad de chat + participantes) y `useLotes` (listado de lotes,
 * reutilizado tal cual de la Épica 4.4).
 *
 * La "línea de tiempo de eventos importantes" **no** se resuelve acá con datos propios:
 * se embebe `AuditLogView` (Épica 7, Módulo 7.2) con `scope={{type:'remate', remateId}}`,
 * el mismo componente que ya alimenta `/remates/:id/auditoria` -- ver
 * docs/37-historial-y-resultados-de-remates.md y ADR-040.
 */
export function RemateHistoryDetailPage() {
  const { remateId } = useParams<{ remateId: string }>();
  const navigate = useNavigate();
  const id = remateId ?? '';

  const { remate, isLoading: isRemateLoading, error: remateError, reload: reloadRemate } =
    useRemateDetail(id);
  const { data: detail, isLoading: isDetailLoading, error: detailError, reload: reloadDetail } =
    useRemateHistoryDetail(id);
  const { lotes, isLoading: isLotesLoading, error: lotesError } = useLotes(id);

  const isLoading = isRemateLoading || isDetailLoading;

  const items: BreadcrumbItem[] = isLoading
    ? []
    : remateError || !remate
      ? [{ label: 'Mis remates', to: '/' }, { label: 'Remate no encontrado' }]
      : [{ label: 'Mis remates', to: '/' }, { label: remate.title }];
  useBreadcrumb(items);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-8 w-2/3" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 8 }, (_, index) => (
            <Skeleton key={index} className="h-16 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (remateError || !remate) {
    return (
      <div className="flex flex-col gap-6">
        <Alert variant="error">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{remateError?.message ?? 'No se pudo cargar este remate.'}</span>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={reloadRemate}>
                Reintentar
              </Button>
              <Button variant="secondary" onClick={() => navigate('/')}>
                Volver al dashboard
              </Button>
            </div>
          </div>
        </Alert>
      </div>
    );
  }

  if (detailError || !detail) {
    return (
      <div className="flex flex-col gap-6">
        <Alert variant="error">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{detailError?.message ?? 'No se pudo cargar el historial de este remate.'}</span>
            <Button variant="secondary" onClick={reloadDetail}>
              Reintentar
            </Button>
          </div>
        </Alert>
      </div>
    );
  }

  const currency = remate.settings.currency;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Historial de {remate.title}</h1>
        {detail.cancellation_reason && (
          <p className="mt-1 text-sm text-danger-600">Cancelado: {detail.cancellation_reason}</p>
        )}
      </div>

      <RemateHistorySummary detail={detail} currency={currency} />

      <ChatActivityCard activity={detail.chat_activity} />

      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-slate-900">Línea de tiempo</h2>
        <AuditLogView scope={{ type: 'remate', remateId: id }} />
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-slate-900">Lotes</h2>
        {lotesError && <Alert variant="error">{lotesError.message}</Alert>}
        {isLotesLoading && !lotesError && (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 3 }, (_, index) => (
              <Skeleton key={index} className="h-16 rounded-lg" />
            ))}
          </div>
        )}
        {!isLotesLoading && !lotesError && (
          <div className="flex flex-col gap-2">
            {lotes.map((lote) => (
              <LoteHistoryCard key={lote.id} remateId={id} lote={lote} currency={currency} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
