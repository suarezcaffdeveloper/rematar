import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AuditLogView } from '../../audit/components/AuditLogView';
import { useLotes, useRemateDetail } from '../../remates/hooks';
import { useVentasAdjudicadasForRemate } from '../../postauction/hooks';
import type { PostAuctionCase } from '../../postauction/types';
import { computeRemateAnalysis } from '../analysis';
import { exportRemateHistoryToExcel, exportRemateHistoryToPdf } from '../export';
import { LoteResultCard } from '../components/LoteResultCard';
import { RemateAnalysisSection } from '../components/RemateAnalysisSection';
import { RemateHistoryHeader } from '../components/RemateHistoryHeader';
import { RemateHistoryPrimaryStats } from '../components/RemateHistoryPrimaryStats';
import { RemateHistorySecondaryStats } from '../components/RemateHistorySecondaryStats';
import { useLoteResultsForRemate, useRemateHistoryDetail } from '../hooks';
import { useBreadcrumb } from '../../../app/layouts/useBreadcrumb';
import { Alert } from '../../../shared/components/Alert';
import type { BreadcrumbItem } from '../../../shared/components/Breadcrumb';
import { Button } from '../../../shared/components/Button';
import { Skeleton } from '../../../shared/components/Skeleton';

/**
 * Informe ejecutivo de un remate finalizado/cancelado (Épica 7, Módulo 7.3 -- rediseño),
 * en `/remates/:remateId/historial`. Pensado para que el rematador lo abra días o semanas
 * después y entienda en segundos cómo salió el remate -- no es un log técnico.
 *
 * Cinco fuentes de datos independientes, cada una con su propio estado de
 * carga/error donde corresponde: `useRemateDetail` (título/categoría/moneda/ubicación),
 * `useRemateHistoryDetail` (KPIs finales + chat), `useLotes` (listado de lotes),
 * `useLoteResultsForRemate` (ofertas/ganador por lote, `features/history/hooks.ts`) y
 * `useVentasAdjudicadasForRemate` (para el estado comercial y el link
 * exacto a "Ir a Ventas Adjudicadas" de cada lote vendido). Estas dos últimas no bloquean
 * el render de la página completa si tardan: cada `LoteResultCard` muestra "—"/botón
 * deshabilitado mientras resuelven.
 *
 * La "actividad del remate" no se resuelve acá con datos propios: se embebe
 * `AuditLogView` (Épica 7, Módulo 7.2) con `scope={{type:'remate', remateId}}`, el mismo
 * componente que alimenta `/remates/:id/auditoria`.
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
  const { data: offerResults } = useLoteResultsForRemate(id, lotes);
  const { data: cases } = useVentasAdjudicadasForRemate(id);

  const casesByLoteId = useMemo(() => {
    const map = new Map<string, PostAuctionCase>();
    for (const item of cases) {
      map.set(item.lote_id, item);
    }
    return map;
  }, [cases]);

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
        <Skeleton className="aspect-[4/3] w-full rounded-2xl sm:aspect-[21/9]" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {Array.from({ length: 5 }, (_, index) => (
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
  const analysis = computeRemateAnalysis(detail, lotes, offerResults);
  const exportBundle = { remate, detail, lotes, offerResults, casesByLoteId, currency };
  const isExportDisabled = isLotesLoading || Boolean(lotesError);

  return (
    <div className="flex flex-col gap-8">
      <RemateHistoryHeader
        remate={remate}
        isExportDisabled={isExportDisabled}
        onExportPdf={() => exportRemateHistoryToPdf(exportBundle)}
        onExportExcel={() => {
          void exportRemateHistoryToExcel(exportBundle);
        }}
      />

      {detail.cancellation_reason && (
        <Alert variant="warning">Cancelado: {detail.cancellation_reason}</Alert>
      )}

      <div className="flex flex-col gap-3">
        <RemateHistoryPrimaryStats detail={detail} currency={currency} />
        <RemateHistorySecondaryStats detail={detail} currency={currency} />
      </div>

      <RemateAnalysisSection analysis={analysis} currency={currency} />

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-slate-900">Resultado de cada lote</h2>
        {lotesError && <Alert variant="error">{lotesError.message}</Alert>}
        {isLotesLoading && !lotesError && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }, (_, index) => (
              <Skeleton key={index} className="h-64 rounded-2xl" />
            ))}
          </div>
        )}
        {!isLotesLoading && !lotesError && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {lotes.map((lote) => (
              <LoteResultCard
                key={lote.id}
                lote={lote}
                currency={currency}
                offerDetail={offerResults.get(lote.id)}
                postAuctionCase={casesByLoteId.get(lote.id)}
              />
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-slate-900">Actividad del remate</h2>
        <AuditLogView scope={{ type: 'remate', remateId: id }} />
      </div>
    </div>
  );
}
