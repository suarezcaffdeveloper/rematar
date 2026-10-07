import clsx from 'clsx';
import { Download } from 'lucide-react';
import { Alert } from '../../../../shared/components/Alert';
import { Skeleton } from '../../../../shared/components/Skeleton';
import { formatCurrency, formatDateShort, formatDateTime, formatDuration, formatRelativeTime, formatTime } from '../../../../shared/lib/format';
import { exportRecentEventsToCsv } from '../../../analytics/exportEvents';
import {
  EVENT_DOT_COLOR_CLASSES,
  RECENT_EVENT_BADGE_VARIANTS,
  RECENT_EVENT_LABELS,
} from '../../../analytics/labels';
import type { BidsTimelineBucket, BidsTimelineGranularity, RemateAnalyticsSnapshot } from '../../../analytics/types';
import { risePercent } from '../../../history/summary';
import type { Lote } from '../../../remates/types';
import { CollapsibleSection } from './CollapsibleSection';
import { useRemateLotes } from './useRemateLotes';

export interface AnalisisTabProps {
  remateId: string;
  analytics: RemateAnalyticsSnapshot | null;
  /** `true` si el primer pedido de analítica falló (y no hay ningún dato para mostrar). */
  hasError: boolean;
  currency: string;
}

const CHART_H = 100;

function bucketLabel(bucket: BidsTimelineBucket, granularity: BidsTimelineGranularity): string {
  return granularity === 'hour' ? `${formatDateShort(bucket.bucket_start)} ${formatTime(bucket.bucket_start)}` : formatTime(bucket.bucket_start);
}

/** Gráfico de área de ofertas, más alto que el de la analítica general, con líneas guía y el
 * pico marcado. A mano (sin librería nueva), igual que `BidsTimelineChart`. */
function OffersChart({ buckets, granularity }: { buckets: BidsTimelineBucket[]; granularity: BidsTimelineGranularity }) {
  if (buckets.length === 0 || buckets.every((bucket) => bucket.count === 0)) {
    return <p className="flex h-48 items-center justify-center rounded-xl bg-surface-subtle text-sm text-ink-muted">Todavía no hubo ofertas en este período.</p>;
  }
  const max = Math.max(1, ...buckets.map((bucket) => bucket.count));
  const peakIndex = buckets.findIndex((bucket) => bucket.count === max);
  const x = (index: number) => (buckets.length <= 1 ? 50 : (index / (buckets.length - 1)) * 100);
  const y = (count: number) => CHART_H - 4 - (count / max) * (CHART_H - 12);
  const line = buckets.map((bucket, index) => `${index === 0 ? 'M' : 'L'} ${x(index)},${y(bucket.count)}`).join(' ');
  const area = `${line} L ${x(buckets.length - 1)},${CHART_H} L ${x(0)},${CHART_H} Z`;
  const ticks = [0, Math.floor((buckets.length - 1) / 2), buckets.length - 1].filter((value, index, all) => all.indexOf(value) === index);

  return (
    <div>
      <div className="flex gap-3">
        <div className="flex h-48 w-6 shrink-0 flex-col justify-between text-right text-xs tabular-nums text-ink-faint" aria-hidden="true">
          <span>{max}</span>
          <span>{Math.round(max / 2)}</span>
          <span>0</span>
        </div>
        <div className="relative h-48 min-w-0 flex-1">
          <svg viewBox={`0 0 100 ${CHART_H}`} preserveAspectRatio="none" role="img" aria-label="Ofertas a lo largo del remate" className="h-full w-full">
            {[4, CHART_H / 2, CHART_H - 4].map((line) => (
              <line key={line} x1="0" x2="100" y1={line} y2={line} stroke="currentColor" className="text-line" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            ))}
            <path d={area} className="fill-brand-500/10" />
            <path d={line} fill="none" className="stroke-brand-600" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            {buckets.map((bucket, index) => (
              <rect key={bucket.bucket_start} x={x(index) - 50 / buckets.length} y="0" width={100 / buckets.length} height={CHART_H} className="fill-transparent" pointerEvents="all">
                <title>
                  {bucketLabel(bucket, granularity)}: {bucket.count} {bucket.count === 1 ? 'oferta' : 'ofertas'}
                </title>
              </rect>
            ))}
          </svg>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-brand-600"
            style={{ left: `${x(peakIndex)}%`, top: `${(y(max) / CHART_H) * 100}%` }}
          />
        </div>
      </div>
      <div className="relative ml-9 mt-2 flex justify-between text-xs tabular-nums text-ink-faint">
        {ticks.map((index) => (
          <span key={buckets[index].bucket_start}>{bucketLabel(buckets[index], granularity)}</span>
        ))}
      </div>
    </div>
  );
}

function Fact({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="border-b border-line py-4 first:pt-0 last:border-b-0">
      <dt className="text-sm text-ink-muted">{label}</dt>
      <dd className="mt-0.5 text-2xl font-semibold tracking-tight tabular-nums text-ink">{value}</dd>
      {hint && <dd className="text-sm text-ink-muted">{hint}</dd>}
    </div>
  );
}

interface RankItem {
  id: string;
  label: string;
  detail?: string;
  value: number;
  display: string;
}

/** Ranking en barras horizontales: una fila por lote, la barra mide contra el mayor valor. */
function Ranking({ items, tone, ariaLabel }: { items: RankItem[]; tone: string; ariaLabel: string }) {
  const max = Math.max(1, ...items.map((item) => item.value));
  return (
    <ol aria-label={ariaLabel} className="border-t border-line">
      {items.map((item) => (
        <li key={item.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 border-b border-line py-3 md:grid-cols-[minmax(0,16rem)_minmax(0,1fr)_7rem]">
          <span className="min-w-0">
            <b className="block truncate text-[15px] font-semibold tracking-tight">{item.label}</b>
            {item.detail && <span className="block truncate text-xs tabular-nums text-ink-muted">{item.detail}</span>}
          </span>
          <b className="text-right text-[15px] font-semibold tabular-nums md:order-3">{item.display}</b>
          <span className="col-span-2 block h-2 overflow-hidden rounded-full bg-surface-subtle md:order-2 md:col-span-1">
            <span className={clsx('block h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none', tone)} style={{ width: `${Math.max(3, (item.value / max) * 100)}%` }} />
          </span>
        </li>
      ))}
    </ol>
  );
}

const MAX_RANK = 8;

function loteName(lote: Lote | undefined, fallback: string): string {
  return lote ? `Lote ${lote.lot_number} · ${lote.title}` : fallback;
}

/**
 * Pestaña "Análisis" de la Cabina: el detalle de cómo viene el remate, en apartados plegables --
 * actividad de ofertas, competencia por lote, cuánto subió cada lote sobre su base, audiencia y la
 * línea de tiempo completa. Las cifras que ya están en "Resumen" (recaudado, lotes vendidos, ritmo
 * y total de ofertas) no se repiten acá.
 */
export function AnalisisTab({ remateId, analytics, hasError, currency }: AnalisisTabProps) {
  const { lotes } = useRemateLotes(remateId, analytics?.lote_status_counts.closed_sold);

  if (!analytics) {
    if (hasError) return <Alert variant="error">No se pudo cargar el análisis de este remate.</Alert>;
    return (
      <div className="flex flex-col gap-6" aria-busy="true">
        <Skeleton className="h-64 rounded-2xl" />
        <Skeleton className="h-48 rounded-2xl" />
      </div>
    );
  }

  const byId = new Map(lotes.map((lote) => [lote.id, lote]));
  const competition: RankItem[] = [...analytics.offers_by_lote]
    .sort((a, b) => b.offer_count - a.offer_count)
    .map((entry) => ({
      id: entry.lote_id,
      label: loteName(byId.get(entry.lote_id), 'Lote'),
      value: entry.offer_count,
      display: `${entry.offer_count} ${entry.offer_count === 1 ? 'oferta' : 'ofertas'}`,
    }));
  const rises: RankItem[] = lotes
    .filter((lote) => lote.status === 'closed_sold')
    .map((lote) => ({ lote, rise: risePercent(lote) }))
    .filter((entry): entry is { lote: Lote; rise: number } => entry.rise !== null)
    .sort((a, b) => b.rise - a.rise)
    .map(({ lote, rise }) => ({
      id: lote.id,
      label: loteName(lote, 'Lote'),
      detail: `${formatCurrency(lote.base_price, currency)} → ${formatCurrency(lote.final_price ?? '0', currency)}`,
      value: Math.max(0, rise),
      display: `${rise >= 0 ? '+' : ''}${rise} %`,
    }));

  const peak = analytics.bids_timeline.reduce<BidsTimelineBucket | null>((best, bucket) => (best === null || bucket.count > best.count ? bucket : best), null);
  const highest = analytics.highest_oferta;
  const withoutOffers = analytics.lote_status_counts.closed_unsold;
  const otherUsers = Math.max(0, analytics.connected_users_total - analytics.connected_buyers);
  const lotesWithOffers = analytics.offers_by_lote.length;
  const events = analytics.recent_events;

  return (
    <div className="flex flex-col">
      <p className="pb-4 text-sm text-ink-muted">Se actualiza solo mientras el remate está en vivo. Última actualización {formatRelativeTime(analytics.generated_at)}.</p>

      <CollapsibleSection
        title="Actividad de ofertas"
        defaultOpen
        hint={analytics.bids_timeline_granularity === 'hour' ? 'Cuántas ofertas entraron por hora.' : 'Cuántas ofertas entraron en cada minuto reciente.'}
      >
        <div className="grid gap-x-12 gap-y-8 border-t border-line pt-6 lg:grid-cols-[minmax(0,1fr)_16rem]">
          <OffersChart buckets={analytics.bids_timeline} granularity={analytics.bids_timeline_granularity} />
          <dl>
            <Fact
              label="Oferta más alta"
              value={highest ? formatCurrency(highest.amount, currency) : '—'}
              hint={highest ? `En el lote ${highest.lot_number}` : 'Todavía sin ofertas'}
            />
            <Fact
              label="Momento de más actividad"
              value={peak && peak.count > 0 ? `${peak.count} ${peak.count === 1 ? 'oferta' : 'ofertas'}` : '—'}
              hint={peak && peak.count > 0 ? bucketLabel(peak, analytics.bids_timeline_granularity) : undefined}
            />
            <Fact
              label="Duración media de un lote"
              value={analytics.average_lote_duration_seconds != null ? formatDuration(analytics.average_lote_duration_seconds * 1000) : '—'}
              hint="Desde que se abre hasta que se cierra"
            />
          </dl>
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        title="Competencia por lote"
        count={competition.length}
        defaultOpen
        hint="Qué lotes despertaron más ofertas. Muestra dónde hay más interés de los compradores."
      >
        {competition.length === 0 ? (
          <p className="border-t border-line py-6 text-sm text-ink-muted">Cuando lleguen las primeras ofertas, vas a ver acá qué lotes compiten más.</p>
        ) : (
          <>
            <Ranking items={competition.slice(0, MAX_RANK)} tone="bg-brand-600" ariaLabel="Lotes con más ofertas" />
            <p className="mt-4 text-sm text-ink-muted">
              {competition.length > MAX_RANK && `Se muestran los ${MAX_RANK} con más ofertas de ${competition.length}. `}
              {withoutOffers > 0 && `${withoutOffers} ${withoutOffers === 1 ? 'lote cerró' : 'lotes cerraron'} sin ofertas.`}
            </p>
          </>
        )}
      </CollapsibleSection>

      <CollapsibleSection
        title="Suba sobre el precio base"
        count={rises.length}
        defaultOpen
        hint="Cuánto más se pagó que el precio base en cada lote vendido, de mayor a menor."
      >
        {rises.length === 0 ? (
          <p className="border-t border-line py-6 text-sm text-ink-muted">Todavía no se vendió ningún lote.</p>
        ) : (
          <>
            <Ranking items={rises.slice(0, MAX_RANK)} tone="bg-success-500" ariaLabel="Lotes que más subieron sobre su base" />
            {rises.length > MAX_RANK && <p className="mt-4 text-sm text-ink-muted">Se muestran los {MAX_RANK} que más subieron de {rises.length}. El resto está en la pestaña Lotes.</p>}
          </>
        )}
      </CollapsibleSection>

      <CollapsibleSection title="Audiencia" defaultOpen hint="Quiénes están mirando el remate en este momento.">
        <dl className="grid border-t border-line sm:grid-cols-3">
          {[
            { label: 'Compradores conectados', value: analytics.connected_buyers, hint: 'Pueden ofertar' },
            { label: 'Otras personas conectadas', value: otherUsers, hint: 'Equipo, martillero y otros' },
            {
              label: 'Ofertas por lote con actividad',
              value: lotesWithOffers > 0 ? (analytics.total_ofertas / lotesWithOffers).toFixed(1).replace('.', ',') : '—',
              hint: lotesWithOffers > 0 ? `En ${lotesWithOffers} ${lotesWithOffers === 1 ? 'lote' : 'lotes'}` : 'Todavía sin ofertas',
            },
          ].map((item) => (
            <div key={item.label} className="border-b border-line py-5 sm:border-b-0 sm:border-l sm:px-6 sm:first:border-l-0 sm:first:pl-0">
              <dd className="text-3xl font-semibold tracking-tight tabular-nums">{item.value}</dd>
              <dt className="mt-1 font-semibold">{item.label}</dt>
              <dd className="text-sm text-ink-muted">{item.hint}</dd>
            </div>
          ))}
        </dl>
      </CollapsibleSection>

      <CollapsibleSection
        title="Línea de tiempo"
        count={events.length}
        defaultOpen={false}
        hint="Todo lo que fue pasando: lotes abiertos, vendidos y desiertos."
      >
        {events.length === 0 ? (
          <p className="border-t border-line py-6 text-sm text-ink-muted">Todavía no pasó nada: cuando se abra un lote, queda registrado acá.</p>
        ) : (
          <>
            <div className="mb-3 flex justify-end">
              <button
                type="button"
                onClick={() => exportRecentEventsToCsv(events, remateId, currency)}
                className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-semibold text-brand-600 transition-colors hover:bg-brand-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                Descargar en CSV
              </button>
            </div>
            <ul className="border-t border-line">
              {events.map((event, index) => (
                <li key={`${event.event_type}-${event.occurred_at}-${index}`} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-4 border-b border-line py-3">
                  <span aria-hidden="true" className={clsx('h-2 w-2 rounded-full', EVENT_DOT_COLOR_CLASSES[RECENT_EVENT_BADGE_VARIANTS[event.event_type]])} />
                  <span className="min-w-0 text-sm">
                    <span className="font-semibold text-ink">{RECENT_EVENT_LABELS[event.event_type]}</span>
                    {event.lot_number && <span className="text-ink-muted"> · Lote {event.lot_number}{event.lote_title ? ` · ${event.lote_title}` : ''}</span>}
                    {event.final_price && <span className="font-semibold tabular-nums text-ink"> · {formatCurrency(event.final_price, currency)}</span>}
                  </span>
                  <time dateTime={event.occurred_at} title={formatDateTime(event.occurred_at)} className="text-xs tabular-nums text-ink-faint">
                    {formatTime(event.occurred_at)}
                  </time>
                </li>
              ))}
            </ul>
          </>
        )}
      </CollapsibleSection>
    </div>
  );
}
