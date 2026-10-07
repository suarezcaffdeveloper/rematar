import type { ReactNode } from 'react';
import clsx from 'clsx';
import { AlertTriangle, ArrowRight, CheckCircle2, Info } from 'lucide-react';
import { Skeleton } from '../../../../shared/components/Skeleton';
import { formatCurrency, formatTime } from '../../../../shared/lib/format';
import { EVENT_DOT_COLOR_CLASSES, RECENT_EVENT_BADGE_VARIANTS, RECENT_EVENT_LABELS } from '../../../analytics/labels';
import type { BidsTimelineBucket, RemateAnalyticsSnapshot } from '../../../analytics/types';
import { buildRemateSentence } from '../../../history/summary';
import type { Lote } from '../../../remates/types';
import { useRemateLotes } from './useRemateLotes';

export type ResumenTarget = 'lotes' | 'equipo' | 'analisis';

export interface ResumenAlert {
  id: string;
  level: 'warning' | 'info';
  title: string;
  detail: string;
  action?: { label: string; target: ResumenTarget };
}

export interface ResumenTabProps {
  remateId: string;
  analytics: RemateAnalyticsSnapshot | null;
  alerts: ResumenAlert[];
  upcomingLotes: Lote[];
  currency: string;
  onGoTo: (target: ResumenTarget) => void;
}

function Sparkline({ buckets }: { buckets: BidsTimelineBucket[] }) {
  if (buckets.length < 2) return null;
  const max = Math.max(1, ...buckets.map((bucket) => bucket.count));
  const step = 100 / (buckets.length - 1);
  const points = buckets.map((bucket, index) => `${(index * step).toFixed(2)},${(22 - (bucket.count / max) * 20).toFixed(2)}`).join(' ');
  return (
    <svg viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden="true" className="mt-3 h-6 w-full text-brand-500">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function KpiCard({ label, value, hint, children }: { label: string; value: ReactNode; hint?: string; children?: ReactNode }) {
  return (
    <div className="min-w-0 rounded-2xl border border-line bg-white p-5">
      <p className="text-sm text-ink-muted">{label}</p>
      <p className="mt-1.5 truncate text-3xl font-semibold tracking-tight tabular-nums text-ink">{value}</p>
      {hint && <p className="mt-1 truncate text-xs text-ink-muted">{hint}</p>}
      {children}
    </div>
  );
}

function SectionTitle({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div className="min-w-0">
        <h2 className="text-lg font-semibold tracking-tight text-ink">{title}</h2>
        {hint && <p className="mt-0.5 text-sm text-ink-muted">{hint}</p>}
      </div>
      {action}
    </div>
  );
}

function LinkButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex shrink-0 items-center gap-1 rounded-md text-sm font-semibold text-brand-600 transition-colors hover:text-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
    >
      {children}
      <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
    </button>
  );
}

function AttentionList({ alerts, onGoTo }: { alerts: ResumenAlert[]; onGoTo: (target: ResumenTarget) => void }) {
  if (alerts.length === 0) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-success-200 bg-success-50 px-5 py-4">
        <CheckCircle2 className="h-5 w-5 shrink-0 text-success-600" aria-hidden="true" />
        <p className="text-sm font-medium text-success-800">Todo en orden: nada requiere tu atención ahora.</p>
      </div>
    );
  }
  return (
    <ul className="flex flex-col gap-3">
      {alerts.map((alert) => {
        const warning = alert.level === 'warning';
        return (
          <li
            key={alert.id}
            className={clsx(
              'flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border px-5 py-4',
              warning ? 'border-warning-200 bg-warning-50' : 'border-line bg-surface-subtle',
            )}
          >
            <span
              className={clsx(
                'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                warning ? 'bg-warning-100 text-warning-700' : 'bg-white text-ink-muted ring-1 ring-line',
              )}
            >
              {warning ? <AlertTriangle className="h-4 w-4" aria-hidden="true" /> : <Info className="h-4 w-4" aria-hidden="true" />}
            </span>
            <div className="min-w-0 flex-1 basis-64">
              <p className="text-sm font-semibold text-ink">{alert.title}</p>
              <p className="text-sm text-ink-muted">{alert.detail}</p>
            </div>
            {alert.action && <LinkButton onClick={() => onGoTo(alert.action!.target)}>{alert.action.label}</LinkButton>}
          </li>
        );
      })}
    </ul>
  );
}

const SEGMENTS = [
  { key: 'closed_sold', label: 'Vendidos', bar: 'bg-success-500', dot: 'bg-success-500' },
  { key: 'closed_unsold', label: 'Desiertos', bar: 'bg-warning-400', dot: 'bg-warning-400' },
  { key: 'open', label: 'En remate', bar: 'bg-brand-500', dot: 'bg-brand-500' },
  { key: 'pending', label: 'Por rematar', bar: 'bg-line-strong', dot: 'bg-line-strong' },
] as const;

function SegmentedBar({ counts, className }: { counts: RemateAnalyticsSnapshot['lote_status_counts']; className?: string }) {
  const total = counts.total || 1;
  return (
    <div role="img" aria-label="Estado de los lotes" className={clsx('flex gap-0.5 overflow-hidden rounded-full bg-surface-subtle', className)}>
      {SEGMENTS.map((segment) =>
        counts[segment.key] > 0 ? (
          <div
            key={segment.key}
            className={clsx('h-full transition-[width] duration-500 motion-reduce:transition-none', segment.bar)}
            style={{ width: `${(counts[segment.key] / total) * 100}%` }}
          />
        ) : null,
      )}
    </div>
  );
}

/** Suba total de lo vendido sobre sus precios base, en %; `null` si todavía no se puede calcular. */
function riseOverBase(lotes: Lote[]): number | null {
  const sold = lotes.filter((lote) => lote.status === 'closed_sold' && lote.final_price != null);
  const base = sold.reduce((sum, lote) => sum + Number(lote.base_price), 0);
  if (!(base > 0)) return null;
  const final = sold.reduce((sum, lote) => sum + Number(lote.final_price), 0);
  return ((final - base) / base) * 100;
}

/**
 * Pestaña "Resumen" de la Cabina: solo lo que importa ahora y lo que hay que hacer -- cifras
 * del remate, avisos con acceso directo, avance de lotes y últimos movimientos. El gráfico de
 * ofertas y el detalle viven en "Análisis"; la barra superior y el riel ya muestran la oferta
 * líder y los conectados, así que acá no se repiten.
 */
export function ResumenTab({ remateId, analytics, alerts, upcomingLotes, currency, onGoTo }: ResumenTabProps) {
  const { lotes } = useRemateLotes(remateId, analytics?.lote_status_counts.closed_sold);

  if (!analytics) {
    return (
      <div className="flex flex-col gap-8" aria-busy="true">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-32 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-40 rounded-2xl" />
        <Skeleton className="h-48 rounded-2xl" />
      </div>
    );
  }

  const counts = analytics.lote_status_counts;
  const rise = riseOverBase(lotes);
  const remaining = counts.pending + counts.open;
  const next = upcomingLotes[0];
  const events = analytics.recent_events.slice(0, 5);
  const sentence = buildRemateSentence({
    status: 'finished',
    lotesSold: counts.closed_sold,
    lotesTotal: counts.total,
    totalSold: analytics.total_awarded_value,
    differencePercentage: rise,
  });

  return (
    <div className="flex min-w-0 flex-col gap-10">
      <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          label="Recaudado"
          value={formatCurrency(analytics.total_awarded_value, currency)}
          hint={rise === null ? undefined : `${rise >= 0 ? '+' : ''}${Math.round(rise)} % sobre los precios base`}
        />
        <KpiCard label="Lotes vendidos" value={`${counts.closed_sold} de ${counts.total}`} hint={remaining > 0 ? `Quedan ${remaining} por rematar` : 'No quedan lotes por rematar'}>
          <SegmentedBar counts={counts} className="mt-3 h-1.5" />
        </KpiCard>
        <KpiCard label="Ofertas por minuto" value={String(analytics.ofertas_per_minute).replace('.', ',')} hint="Ritmo de los últimos minutos">
          <Sparkline buckets={analytics.bids_timeline} />
        </KpiCard>
        <KpiCard label="Ofertas en total" value={analytics.total_ofertas} hint={analytics.total_ofertas === 0 ? 'Todavía nadie ofertó' : 'En todo el remate'} />
      </dl>

      <section id="empresa-avisos" aria-label="Avisos" className="flex flex-col gap-4">
        <SectionTitle title="Qué necesita tu atención" />
        <AttentionList alerts={alerts} onGoTo={onGoTo} />
      </section>

      <section aria-label="Avance del remate" className="flex flex-col gap-5 rounded-2xl border border-line bg-white p-6">
        <SectionTitle title="Avance del remate" />
        <p className="max-w-2xl text-balance text-xl font-medium leading-snug tracking-tight text-ink">
          {sentence.map((part, index) => (
            <span key={index} className={part.strong ? 'font-semibold' : 'text-ink-muted'}>
              {part.text}
            </span>
          ))}
        </p>
        <SegmentedBar counts={counts} className="h-3" />
        <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          {SEGMENTS.map((segment) => (
            <li key={segment.key} className="inline-flex items-center gap-2 text-ink-muted">
              <span aria-hidden="true" className={clsx('h-2.5 w-2.5 rounded-full', segment.dot)} />
              <span className="font-semibold tabular-nums text-ink">{counts[segment.key]}</span>
              {segment.label}
            </li>
          ))}
        </ul>
        {next && (
          <p className="border-t border-line pt-4 text-sm text-ink-muted">
            Sigue en la cola: <span className="font-semibold text-ink">Lote {next.lot_number} · {next.title}</span>
          </p>
        )}
      </section>

      <section aria-label="Últimos movimientos" className="flex flex-col gap-4">
        <SectionTitle
          title="Últimos movimientos"
          action={events.length > 0 ? <LinkButton onClick={() => onGoTo('analisis')}>Ver todo en Análisis</LinkButton> : undefined}
        />
        {events.length === 0 ? (
          <p className="text-sm text-ink-muted">Cuando se abra o se cierre un lote, lo vas a ver acá.</p>
        ) : (
          <ul className="divide-y divide-line rounded-2xl border border-line bg-white">
            {events.map((event, index) => (
              <li key={`${event.event_type}-${event.occurred_at}-${index}`} className="flex items-center gap-3 px-5 py-3.5">
                <span aria-hidden="true" className={clsx('h-2 w-2 shrink-0 rounded-full', EVENT_DOT_COLOR_CLASSES[RECENT_EVENT_BADGE_VARIANTS[event.event_type]])} />
                <span className="min-w-0 flex-1 truncate text-sm text-ink">
                  {RECENT_EVENT_LABELS[event.event_type]}
                  {event.lot_number && <span className="text-ink-muted"> · Lote {event.lot_number}</span>}
                </span>
                {event.final_price && (
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-ink">{formatCurrency(event.final_price, currency)}</span>
                )}
                <span className="shrink-0 text-xs tabular-nums text-ink-faint">{formatTime(event.occurred_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
