import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Download, FileSpreadsheet, TriangleAlert } from 'lucide-react';
import { useBreadcrumb } from '../../../app/layouts/useBreadcrumb';
import { useTopNavLayout } from '../../../app/layouts/useTopNavLayout';
import { Alert } from '../../../shared/components/Alert';
import type { BreadcrumbItem } from '../../../shared/components/Breadcrumb';
import { Button } from '../../../shared/components/Button';
import { Skeleton } from '../../../shared/components/Skeleton';
import { formatDateTime } from '../../../shared/lib/format';
import { useVentasAdjudicadasForRemate } from '../../postauction/hooks';
import { statusIndex } from '../../postauction/sales';
import type { PostAuctionCase } from '../../postauction/types';
import { formatCompactMoney } from '../../rematador/dashboard';
import { pickLoteCoverImages } from '../../remates/collage';
import { CoverPlaceholder } from '../../remates/components/CoverPlaceholder';
import { LotesCollagePlaceholder } from '../../remates/components/LotesCollagePlaceholder';
import { CATEGORY_LABELS } from '../../remates/labels';
import { useLotes, useRemateDetail } from '../../remates/hooks';
import type { Lote } from '../../remates/types';
import { computeRemateAnalysis } from '../analysis';
import { LoteHistoryDrawer } from '../components/LoteHistoryDrawer';
import { LoteHistoryRow } from '../components/LoteHistoryRow';
import { exportRemateHistoryToExcel, exportRemateHistoryToPdf } from '../export';
import { useLoteResultsForRemate, useRemateHistoryDetail } from '../hooks';
import { buildRemateSentence, describeUnsold, describeUnsoldText, formatDurationLong, risePercent } from '../summary';
import { optimizedImage } from '../../../shared/lib/image';

type LoteFilter = 'all' | 'sold' | 'unsold';

function SectionHeading({ id, title, description }: { id: string; title: string; description?: string }) {
  return (
    <div className="mb-6">
      <h2 id={id} className="text-2xl font-semibold tracking-tight sm:text-3xl">
        {title}
      </h2>
      {description && <p className="mt-1.5 max-w-[60ch] text-ink-muted">{description}</p>}
    </div>
  );
}

/**
 * Resumen de un remate terminado (Épica 7, Módulo 7.3; rediseño editorial), en
 * `/remates/:remateId/historial`. Pensado para que la empresa lo abra días o semanas después
 * y entienda en segundos cómo salió: una frase que lo cuenta, cuatro números, qué falta
 * cobrar, lo más destacado y el resultado de cada lote (que se abre tocándolo).
 *
 * Cinco fuentes de datos independientes: `useRemateDetail` (título/portada/moneda),
 * `useRemateHistoryDetail` (KPIs finales + chat), `useLotes`, `useLoteResultsForRemate`
 * (ofertas/ganador por lote) y `useVentasAdjudicadasForRemate` (cobro y link a la venta).
 * Las últimas dos no bloquean la página: mientras llegan, la fila muestra "—". La actividad
 * del chat es un resumen simple; el registro técnico completo sigue en `/remates/:id/auditoria`.
 */
export function RemateHistoryDetailPage() {
  useTopNavLayout();
  const { remateId } = useParams<{ remateId: string }>();
  const navigate = useNavigate();
  const id = remateId ?? '';

  const { remate, isLoading: isRemateLoading, error: remateError, reload: reloadRemate } = useRemateDetail(id);
  const { data: detail, isLoading: isDetailLoading, error: detailError, reload: reloadDetail } = useRemateHistoryDetail(id);
  const { lotes, isLoading: isLotesLoading, error: lotesError } = useLotes(id);
  const { data: offerResults } = useLoteResultsForRemate(id, lotes);
  const { data: cases } = useVentasAdjudicadasForRemate(id);
  const [filter, setFilter] = useState<LoteFilter>('all');
  const [openLote, setOpenLote] = useState<Lote | null>(null);

  const casesByLoteId = useMemo(() => {
    const map = new Map<string, PostAuctionCase>();
    for (const item of cases) map.set(item.lote_id, item);
    return map;
  }, [cases]);

  const isLoading = isRemateLoading || isDetailLoading;
  const items: BreadcrumbItem[] = isLoading
    ? []
    : remateError || !remate
      ? [{ label: 'Historial', to: '/historial' }, { label: 'Remate no encontrado' }]
      : [{ label: 'Historial', to: '/historial' }, { label: remate.title }];
  useBreadcrumb(items);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white">
        <div className="mx-auto flex w-full max-w-[110rem] flex-col gap-8 px-3 py-8 sm:px-6 lg:px-10">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="aspect-[16/6] w-full rounded-3xl" />
          <Skeleton className="h-40 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  if (remateError || !remate) {
    return (
      <div className="mx-auto w-full max-w-[110rem] px-3 py-8 sm:px-6 lg:px-10">
        <Alert variant="error">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{remateError?.message ?? 'No se pudo cargar este remate.'}</span>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={reloadRemate}>
                Reintentar
              </Button>
              <Button variant="secondary" onClick={() => navigate('/historial')}>
                Volver al historial
              </Button>
            </div>
          </div>
        </Alert>
      </div>
    );
  }

  if (detailError || !detail) {
    return (
      <div className="mx-auto w-full max-w-[110rem] px-3 py-8 sm:px-6 lg:px-10">
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
  const timed = remate.auction_type === 'timed';
  const cancelled = detail.status === 'cancelled';
  const analysis = computeRemateAnalysis(detail, lotes, offerResults);
  const exportBundle = { remate, detail, lotes, offerResults, casesByLoteId, currency };
  const isExportDisabled = isLotesLoading || Boolean(lotesError);
  const resolvedAt = detail.finished_at ?? detail.cancelled_at ?? detail.starts_at;

  const { closed_sold: soldCount, total: lotesTotal } = detail.lote_status_counts;
  const unsold = describeUnsold(lotes, offerResults);
  const unpaid = cases.filter((item) => statusIndex(item.status) <= 2);
  const unpaidSum = unpaid.reduce((acc, item) => acc + (Number(item.final_price) || 0), 0);
  const maxRise = Math.max(5, ...lotes.map((lote) => risePercent(lote) ?? 0));
  const visibleLotes = lotes.filter((lote) => filter === 'all' || (filter === 'sold' ? lote.status === 'closed_sold' : lote.status !== 'closed_sold'));
  const soldLotes = lotes.filter((lote) => lote.status === 'closed_sold').length;
  const cover = remate.cover_image_url;
  const coverImages = pickLoteCoverImages(lotes);

  const sentence = buildRemateSentence({
    status: detail.status,
    lotesSold: soldCount,
    lotesTotal,
    totalSold: detail.total_awarded_value,
    differencePercentage: analysis.differencePercentage,
    cancelledOn: detail.cancelled_at ? new Date(detail.cancelled_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'long' }) : null,
  });

  const money = (value: number) => formatCompactMoney(value, currency);
  const numbers = [
    { value: money(Number(detail.total_awarded_value) || 0), label: 'Total vendido', detail: soldCount > 0 ? `${soldCount} ${soldCount === 1 ? 'lote' : 'lotes'} con precio final` : 'sin ventas' },
    { value: `${soldCount} de ${lotesTotal}`, label: 'Lotes vendidos', detail: lotesTotal > 0 ? `${Math.round((soldCount / lotesTotal) * 100)}% del remate` : '' },
    {
      value: new Intl.NumberFormat('es-AR').format(detail.total_ofertas),
      label: 'Ofertas recibidas',
      detail: lotesTotal > 0 ? `${(detail.total_ofertas / lotesTotal).toFixed(1).replace('.', ',')} por lote en promedio` : '',
    },
    { value: String(detail.participants_count), label: 'Participantes', detail: 'personas que ofertaron o escribieron en la sala' },
  ];

  const highlights = [
    {
      label: 'Lote más disputado',
      value: detail.top_lote_by_offers ? `Lote ${detail.top_lote_by_offers.lot_number}` : '—',
      detail: detail.top_lote_by_offers ? `${detail.top_lote_by_offers.lote_title} · ${detail.top_lote_by_offers.offer_count} ofertas` : 'Nadie ofertó',
    },
    {
      label: 'Oferta más alta',
      value: detail.highest_oferta ? money(Number(detail.highest_oferta.amount)) : '—',
      detail: detail.highest_oferta ? `Lote ${detail.highest_oferta.lot_number} · ${detail.highest_oferta.lote_title}` : 'Sin ofertas',
    },
    { label: 'Lotes sin vender', value: String(unsold.total), detail: describeUnsoldText(unsold) },
    {
      label: timed ? 'Duración' : 'Tiempo de subasta',
      value: formatDurationLong(detail.duration_seconds),
      detail: timed
        ? 'Los lotes cerraron solos'
        : detail.average_lote_duration_seconds
          ? `${formatDurationLong(detail.average_lote_duration_seconds)} por lote en promedio`
          : '',
    },
  ];

  return (
    <div className="min-h-screen bg-white font-display text-ink">
      <div className="mx-auto w-full max-w-[110rem] px-3 py-8 sm:px-6 lg:px-10">
        <Link
          to="/historial"
          className="mb-6 inline-flex items-center gap-1.5 rounded-lg text-sm font-medium text-ink-muted transition-colors hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          Historial
        </Link>

        <header className="grid items-end gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-10">
          <div className="relative aspect-[16/10] overflow-hidden rounded-3xl bg-surface-subtle">
            {cover ? (
              <img src={optimizedImage(cover, 480)} loading="lazy" decoding="async" alt="" className="h-full w-full object-cover" />
            ) : coverImages.length > 0 ? (
              <LotesCollagePlaceholder images={coverImages} className="h-full w-full" />
            ) : (
              <CoverPlaceholder className="h-full w-full" />
            )}
          </div>
          <div>
            <div className="mb-3.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-muted">
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${cancelled ? 'bg-danger-50 text-danger-600' : 'bg-slate-100 text-slate-700'}`}>
                {cancelled ? 'Cancelado' : 'Finalizado'}
              </span>
              {resolvedAt && <span>{formatDateTime(resolvedAt)}</span>}
              {remate.location && <span>· {remate.location}</span>}
              <span>· {CATEGORY_LABELS[remate.category]}</span>
            </div>
            <h1 className="text-balance text-4xl font-semibold leading-[1.02] tracking-tight sm:text-5xl">{remate.title}</h1>
            <p className="mt-4 text-xl leading-snug tracking-tight sm:text-2xl">
              {sentence.map((part, index) => (part.strong ? <b key={index} className="font-semibold">{part.text}</b> : <span key={index}>{part.text}</span>))}
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button
                variant="hero"
                disabled={isExportDisabled}
                title={isExportDisabled ? 'Todavía se están cargando los datos del remate' : undefined}
                onClick={() => exportRemateHistoryToPdf(exportBundle)}
              >
                <Download aria-hidden="true" className="h-4 w-4" />
                Descargar informe PDF
              </Button>
              <Button
                variant="secondary"
                className="rounded-full"
                disabled={isExportDisabled}
                title={isExportDisabled ? 'Todavía se están cargando los datos del remate' : undefined}
                onClick={() => {
                  void exportRemateHistoryToExcel(exportBundle);
                }}
              >
                <FileSpreadsheet aria-hidden="true" className="h-4 w-4" />
                Descargar Excel
              </Button>
            </div>
          </div>
        </header>

        {cancelled ? (
          <section className="mt-12">
            <div className="flex gap-3.5 rounded-3xl bg-danger-50 p-6 text-danger-700">
              <TriangleAlert aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <h2 className="text-xl font-semibold tracking-tight">Remate cancelado</h2>
                <p className="mt-1">{detail.cancellation_reason ? `Motivo: ${detail.cancellation_reason}.` : 'No se registró un motivo.'}</p>
              </div>
            </div>
          </section>
        ) : (
          <>
            <section aria-labelledby="happened-title" className="mt-16">
              <SectionHeading id="happened-title" title="Lo que pasó" />
              <dl className="grid grid-cols-2 border-t border-ink lg:grid-cols-4">
                {numbers.map((item) => (
                  <div key={item.label} className="flex flex-col gap-1.5 border-b border-line py-6 pr-4 lg:border-b-0 lg:border-l lg:px-6 lg:first:border-l-0 lg:first:pl-0">
                    <dd className="order-1 text-3xl font-semibold leading-none tracking-tight tabular-nums sm:text-4xl lg:text-5xl">{item.value}</dd>
                    <dt className="order-2 mt-1 font-semibold">{item.label}</dt>
                    <dd className="order-3 text-sm text-ink-muted">{item.detail}</dd>
                  </div>
                ))}
              </dl>
            </section>

            {soldCount > 0 && cases.length > 0 && (
              <section aria-label="Cobro y entrega" className="mt-10">
                <div
                  className={`flex flex-wrap items-center justify-between gap-5 rounded-3xl px-6 py-5 ${unpaid.length > 0 ? 'bg-warning-50 text-warning-900' : 'bg-success-50 text-success-700'}`}
                >
                  <div>
                    <h2 className="text-xl font-semibold leading-tight tracking-tight">
                      {unpaid.length > 0
                        ? `${unpaid.length} de ${cases.length} ${cases.length === 1 ? 'venta todavía sin cobrar' : 'ventas todavía sin cobrar'}`
                        : `${cases.length === 1 ? 'La venta ya está cobrada' : `Las ${cases.length} ventas ya están cobradas`}`}
                    </h2>
                    <p className="mt-1 max-w-[60ch] text-sm opacity-90">
                      {unpaid.length > 0
                        ? `${money(unpaidSum)} esperando el pago. Entrá a Ventas adjudicadas para contactar a los compradores y registrar cada pago.`
                        : 'Pago registrado en todas las ventas de este remate.'}
                    </p>
                  </div>
                  <Button variant={unpaid.length > 0 ? 'hero' : 'secondary'} className="rounded-full" onClick={() => navigate('/ventas-adjudicadas')}>
                    Ver en Ventas adjudicadas
                  </Button>
                </div>
              </section>
            )}

            <section aria-labelledby="highlights-title" className="mt-16">
              <SectionHeading id="highlights-title" title="Lo más destacado" />
              <dl className="grid grid-cols-2 border-t border-ink lg:grid-cols-4">
                {highlights.map((item) => (
                  <div key={item.label} className="border-b border-line py-5 pr-4 lg:border-b-0 lg:border-l lg:px-6 lg:first:border-l-0 lg:first:pl-0">
                    <dt className="text-sm font-semibold text-ink-muted">{item.label}</dt>
                    <dd className="mt-1.5 text-2xl font-semibold leading-tight tracking-tight">{item.value}</dd>
                    <dd className="mt-1 text-sm text-ink-muted">{item.detail}</dd>
                  </div>
                ))}
              </dl>
            </section>
          </>
        )}

        <section aria-labelledby="lotes-title" className="mt-16">
          <SectionHeading
            id="lotes-title"
            title="Resultado de cada lote"
            description={cancelled ? 'Los lotes no llegaron a abrirse.' : 'Tocá un lote para ver quién ganó y cada una de las ofertas.'}
          />
          {lotesError && <Alert variant="error">{lotesError.message}</Alert>}
          {isLotesLoading && !lotesError && (
            <div className="flex flex-col gap-3">
              {Array.from({ length: 4 }, (_, index) => (
                <Skeleton key={index} className="h-16 w-full rounded-xl" />
              ))}
            </div>
          )}
          {!isLotesLoading && !lotesError && lotes.length === 0 && <p className="text-ink-muted">Este remate no tenía lotes cargados.</p>}
          {!isLotesLoading && !lotesError && lotes.length > 0 && (
            <>
              {!cancelled && (
                <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-3">
                  <div role="group" aria-label="Filtrar lotes" className="flex flex-wrap gap-1.5">
                    {(
                      [
                        { value: 'all', label: 'Todos', count: lotes.length },
                        { value: 'sold', label: 'Vendidos', count: soldLotes },
                        { value: 'unsold', label: 'Sin vender', count: lotes.length - soldLotes },
                      ] as const
                    ).map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        aria-pressed={filter === option.value}
                        onClick={() => setFilter(option.value)}
                        className={`rounded-full border px-4 py-2 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                          filter === option.value ? 'border-ink bg-ink text-white' : 'border-line bg-white text-ink-muted hover:border-ink hover:text-ink'
                        }`}
                      >
                        {option.label}
                        <span className="ml-1.5 font-medium tabular-nums opacity-65">{option.count}</span>
                      </button>
                    ))}
                  </div>
                  <p className="text-sm text-ink-muted">La barra muestra cuánto subió cada lote sobre su precio base.</p>
                </div>
              )}
              <ul className="border-t border-ink [&:hover>li:not(:hover)]:opacity-50">
                {visibleLotes.map((lote) => (
                  <LoteHistoryRow
                    key={lote.id}
                    lote={lote}
                    currency={currency}
                    offerDetail={offerResults.get(lote.id)}
                    postAuctionCase={casesByLoteId.get(lote.id)}
                    maxRise={maxRise}
                    onOpen={() => setOpenLote(lote)}
                  />
                ))}
              </ul>
            </>
          )}
        </section>

        {!cancelled && !timed && detail.chat_activity.message_count > 0 && (
          <section aria-labelledby="sala-title" className="mt-16">
            <SectionHeading id="sala-title" title="Actividad en la sala" description="Lo que pasó en el chat durante el remate en vivo." />
            <dl className="grid grid-cols-1 border-t border-ink sm:grid-cols-3">
              {[
                { value: detail.chat_activity.message_count, label: 'Mensajes', detail: 'enviados por los compradores' },
                { value: detail.chat_activity.participant_count, label: 'Personas que escribieron', detail: 'distintas' },
                { value: detail.chat_activity.deleted_count, label: 'Mensajes eliminados', detail: 'por moderación' },
              ].map((item) => (
                <div key={item.label} className="border-b border-line py-5 pr-4 sm:border-b-0 sm:border-l sm:px-6 sm:first:border-l-0 sm:first:pl-0">
                  <dd className="text-3xl font-semibold tracking-tight tabular-nums">{item.value}</dd>
                  <dt className="mt-1 font-semibold">{item.label}</dt>
                  <dd className="text-sm text-ink-muted">{item.detail}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-4">
              <Link
                to={`/remates/${id}/auditoria`}
                className="rounded text-sm font-semibold text-brand-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                Ver el registro completo de actividad
              </Link>
            </p>
          </section>
        )}
      </div>

      {openLote && (
        <LoteHistoryDrawer
          remateId={id}
          lote={openLote}
          currency={currency}
          postAuctionCase={casesByLoteId.get(openLote.id)}
          onClose={() => setOpenLote(null)}
        />
      )}
    </div>
  );
}
