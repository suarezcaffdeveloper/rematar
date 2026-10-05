import { useEffect, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { AlertTriangle, ExternalLink, Info, MessageCircleQuestion } from 'lucide-react';
import { formatCurrency } from '../../../../shared/lib/format';
import type { ConnectionStatus } from '../../../../shared/websocket/client';
import { AnalyticsPanel } from '../../../analytics/components/AnalyticsPanel';
import { BidsTimelineChart } from '../../../analytics/components/BidsTimelineChart';
import { EventsTimeline } from '../../../analytics/components/EventsTimeline';
import { useRemateAnalytics } from '../../../analytics/hooks';
import { ConnectionStatusBadge } from '../../../sala/components/ConnectionStatusBadge';
import type { OfertaSnapshotEntry } from '../../../sala/types';
import { STATUS_LABELS } from '../../../remates/labels';
import type { Lote, Remate } from '../../../remates/types';
import { useElapsedTime } from '../../hooks';
import { ConsolaDesiertoLotesPanel } from '../ConsolaDesiertoLotesPanel';
import { ConsolaUpcomingLotesPanel } from '../ConsolaUpcomingLotesPanel';
import { OperatorCodePanel } from '../OperatorCodePanel';
import { PrivateAccessPanel } from '../PrivateAccessPanel';
import { StreamPanel } from '../StreamPanel';
import { EmpresaRail } from './EmpresaRail';
import { useBuyerQuestions } from './useBuyerQuestions';

type TabId = 'resumen' | 'lotes' | 'equipo' | 'analisis';

export interface EmpresaConsolaViewProps {
  remate: Remate;
  activeLote: Lote | null;
  winningOffer: OfertaSnapshotEntry | null;
  recentOffers: OfertaSnapshotEntry[];
  connectedUsers: number;
  connectionStatus: ConnectionStatus;
  upcomingLotes: Lote[];
  desiertoLotes: Lote[];
  currency: string;
  currentUserId: string | undefined;
  subscribeToRealtime: (listener: (message: unknown) => void) => () => void;
  onRemateChange: () => void;
}

const noop = () => {};

function SectionHead({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="min-w-0">
      <h2 className="text-lg font-semibold tracking-tight text-ink">{title}</h2>
      {hint && <p className="mt-0.5 max-w-xl text-sm text-ink-muted">{hint}</p>}
    </div>
  );
}

function useSecondsSince(iso: string | null): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!iso) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [iso]);
  if (!iso) return null;
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
}

function agoLabel(seconds: number): string {
  if (seconds < 60) return `hace ${seconds} s`;
  return `hace ${Math.floor(seconds / 60)} min`;
}

/**
 * Consola de la empresa dueña en un remate en vivo ("Cabina"): la empresa no opera -- eso es del
 * martillero --, mira cómo va y contesta a los compradores. Una barra fija con lo esencial
 * (estado, lote y oferta líder, recaudado, preguntas pendientes y "Ver como comprador"), el lote
 * en remate como pieza central, cuatro pestañas (Resumen, Lotes, Equipo y accesos, Análisis) y
 * una columna derecha, visible desde cualquiera, con las ofertas y la bandeja de preguntas.
 */
export function EmpresaConsolaView({
  remate,
  activeLote,
  winningOffer,
  recentOffers,
  connectedUsers,
  connectionStatus,
  upcomingLotes,
  desiertoLotes,
  currency,
  currentUserId,
  subscribeToRealtime,
  onRemateChange,
}: EmpresaConsolaViewProps) {
  const [tab, setTab] = useState<TabId>('resumen');
  const elapsed = useElapsedTime(remate);
  const { data: analytics } = useRemateAnalytics(remate.id, subscribeToRealtime);
  const buyerQuestions = useBuyerQuestions(remate.id, subscribeToRealtime, currentUserId);
  const lastOfferAge = useSecondsSince(winningOffer?.created_at ?? null);

  const isPaused = remate.status === 'paused';
  const hasStream = Boolean(remate.stream_video_id);
  const pendingQuestions = buyerQuestions.pending.length;
  const leadAmount = winningOffer ? formatCurrency(winningOffer.amount, currency) : null;

  const alerts: Array<{ id: string; level: 'warning' | 'info'; title: string; detail: string }> = [];
  if (isPaused) {
    alerts.push({
      id: 'paused',
      level: 'warning',
      title: 'El remate está en pausa',
      detail: 'Los compradores no pueden ofertar hasta que el martillero lo reanude.',
    });
  }
  if (!isPaused && activeLote && lastOfferAge !== null && lastOfferAge >= 60) {
    alerts.push({
      id: 'quiet',
      level: 'warning',
      title: `El lote ${activeLote.lot_number} lleva ${Math.floor(lastOfferAge / 60)} min sin ofertas nuevas`,
      detail: 'Suele ser el momento en que el martillero adjudica o cierra el lote.',
    });
  }
  if (!hasStream) {
    alerts.push({
      id: 'no-stream',
      level: 'info',
      title: 'La sala no tiene transmisión',
      detail: 'Los compradores no ven el video. Cargá el link de YouTube desde "Equipo y accesos".',
    });
  }
  if (desiertoLotes.length > 0) {
    alerts.push({
      id: 'desiertos',
      level: 'info',
      title: `${desiertoLotes.length} ${desiertoLotes.length === 1 ? 'lote desierto espera' : 'lotes desiertos esperan'} una decisión`,
      detail: 'Podés volver a rematarlos desde la pestaña "Lotes".',
    });
  }
  const urgentAlerts = alerts.filter((alert) => alert.level === 'warning').length;

  const counts = analytics?.lote_status_counts;
  const closedLotes = counts ? counts.closed_sold + counts.closed_unsold : 0;
  const soldPct = counts && counts.total > 0 ? Math.round((counts.closed_sold / counts.total) * 100) : 0;

  const tabs: Array<[TabId, string, number | string | null]> = [
    ['resumen', 'Resumen', null],
    ['lotes', 'Lotes', desiertoLotes.length > 0 ? desiertoLotes.length : null],
    ['equipo', 'Equipo y accesos', hasStream ? null : '!'],
    ['analisis', 'Análisis', null],
  ];

  return (
    <div className="-mx-3 -my-4 min-h-screen bg-white font-display text-ink sm:-mx-4 lg:-mx-6">
      <header className="sticky top-0 z-40 border-b border-line bg-white">
        <div className="flex w-full items-center gap-x-6 px-3 py-3 sm:px-6 lg:px-10">
          <div className="flex min-w-0 flex-1 items-center gap-x-6 overflow-hidden">
            <div className="min-w-0 shrink basis-56">
              <h1 className="truncate text-sm font-semibold tracking-tight">{remate.title}</h1>
              <p className="mt-0.5 flex items-center gap-3 text-xs text-ink-muted">
                <span className="inline-flex items-center gap-1.5">
                  <span
                    aria-hidden="true"
                    className={clsx('h-2 w-2 rounded-full', isPaused ? 'bg-ink-faint' : 'animate-pulse bg-danger-500')}
                  />
                  <span className="font-semibold uppercase tracking-wide">{STATUS_LABELS[remate.status]}</span>
                </span>
                {elapsed && <span className="tabular-nums">{elapsed}</span>}
                {connectionStatus !== 'open' && <ConnectionStatusBadge status={connectionStatus} />}
              </p>
            </div>
            <span aria-hidden="true" className="hidden h-8 w-px shrink-0 bg-line md:block" />
            <div className="hidden min-w-0 flex-col md:flex">
              <span className="text-[11px] leading-none text-ink-muted">
                {activeLote ? `Lote ${activeLote.lot_number} · líder` : 'Lote en remate'}
              </span>
              <span className="mt-1 truncate text-sm font-semibold leading-none tabular-nums">{leadAmount ?? '—'}</span>
            </div>
            <div className="hidden min-w-0 flex-col lg:flex">
              <span className="text-[11px] leading-none text-ink-muted">Recaudado</span>
              <span className="mt-1 truncate text-sm font-semibold leading-none tabular-nums">
                {analytics ? formatCurrency(analytics.total_awarded_value, currency) : '—'}
              </span>
            </div>
            <div className="hidden min-w-0 flex-col sm:flex">
              <span className="text-[11px] leading-none text-ink-muted">Conectados</span>
              <span className="mt-1 truncate text-sm font-semibold leading-none tabular-nums">{connectedUsers}</span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {pendingQuestions > 0 && (
              <a
                href="#empresa-rail"
                className="inline-flex items-center gap-1.5 rounded-full bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                <MessageCircleQuestion className="h-3.5 w-3.5" aria-hidden="true" />
                {pendingQuestions} {pendingQuestions === 1 ? 'pregunta' : 'preguntas'}
              </a>
            )}
            {urgentAlerts > 0 && (
              <span className="hidden items-center gap-1.5 rounded-full bg-warning-400 px-3 py-1.5 text-xs font-semibold text-ink md:inline-flex">
                {urgentAlerts} {urgentAlerts === 1 ? 'aviso' : 'avisos'}
              </span>
            )}
            <a
              href={`/remates/${remate.id}/sala`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-line px-3.5 py-1.5 text-xs font-semibold text-ink transition-colors hover:border-ink hover:bg-surface-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Ver como comprador</span>
              <span className="sr-only">Ver como comprador (se abre en otra pestaña)</span>
            </a>
          </div>
        </div>
      </header>

      <div className="w-full px-3 pb-16 pt-5 sm:px-6 lg:px-10">
        <div className="grid gap-x-10 gap-y-10 xl:grid-cols-[minmax(0,1fr)_24rem]">
          <main className="min-w-0">
            <Hero activeLote={activeLote} leadAmount={leadAmount} winningOffer={winningOffer} lastOfferAge={lastOfferAge} currency={currency} hasUpcoming={upcomingLotes.length > 0} />

            <div role="tablist" aria-label="Secciones del panel" className="mt-8 flex gap-7 overflow-x-auto border-b border-line">
              {tabs.map(([id, label, badge]) => (
                <button
                  key={id}
                  role="tab"
                  type="button"
                  aria-selected={tab === id}
                  aria-controls={`empresa-panel-${id}`}
                  onClick={() => setTab(id)}
                  className={clsx(
                    '-mb-px flex shrink-0 items-center gap-2 border-b-2 pb-3 pt-1 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
                    tab === id ? 'border-ink text-ink' : 'border-transparent text-ink-muted hover:text-ink',
                  )}
                >
                  {label}
                  {badge !== null && (
                    <span className="rounded-full bg-warning-100 px-1.5 text-xs font-semibold tabular-nums text-warning-800">{badge}</span>
                  )}
                </button>
              ))}
            </div>

            <div id={`empresa-panel-${tab}`} role="tabpanel" className="pt-8">
              {tab === 'resumen' && (
                <div className="flex min-w-0 flex-col gap-10">
                  <dl className="grid grid-cols-2 divide-x divide-line border-b border-line pb-2 lg:grid-cols-4">
                    <Kpi
                      label="Recaudado"
                      value={analytics ? formatCurrency(analytics.total_awarded_value, currency) : '—'}
                      hint={counts ? `${counts.closed_sold} ${counts.closed_sold === 1 ? 'lote vendido' : 'lotes vendidos'}` : undefined}
                    />
                    <Kpi
                      label="Lotes cerrados"
                      value={counts ? `${closedLotes}/${counts.total}` : '—'}
                      hint={counts ? `${soldPct} % vendidos` : undefined}
                    />
                    <Kpi label="Compradores" value={analytics?.connected_buyers ?? '—'} hint="Conectados ahora" />
                    <Kpi
                      label="Ofertas por minuto"
                      value={analytics ? String(analytics.ofertas_per_minute).replace('.', ',') : '—'}
                      hint={analytics ? `${analytics.total_ofertas} en total` : undefined}
                    />
                  </dl>

                  <section aria-label="Avisos">
                    <SectionHead title="Qué necesita tu atención" />
                    <div className="mt-4">
                      <AlertList alerts={alerts} />
                    </div>
                  </section>

                  <section aria-label="Pulso del remate">
                    <SectionHead title="Pulso del remate" hint="Ofertas por minuto en los últimos minutos." />
                    <div className="mt-4">
                      {analytics ? (
                        <BidsTimelineChart buckets={analytics.bids_timeline} granularity={analytics.bids_timeline_granularity} />
                      ) : (
                        <p className="py-6 text-sm text-ink-faint">Cargando analítica…</p>
                      )}
                    </div>
                  </section>

                  <div className="grid gap-x-12 gap-y-10 lg:grid-cols-2">
                    <section aria-label="Avance de lotes">
                      <SectionHead
                        title="Avance de lotes"
                        hint={counts ? `Quedan ${counts.pending + counts.open} por rematar.` : undefined}
                      />
                      <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-surface-subtle">
                        <div className="h-full rounded-full bg-success-500 transition-[width]" style={{ width: `${soldPct}%` }} />
                      </div>
                    </section>
                    <section aria-label="Últimos movimientos">
                      <SectionHead title="Últimos movimientos" />
                      <div className="mt-3">
                        <EventsTimeline events={analytics?.recent_events.slice(0, 5) ?? []} />
                      </div>
                    </section>
                  </div>
                </div>
              )}

              {tab === 'lotes' && (
                <div className="grid gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
                  <section aria-label="Próximos lotes">
                    <SectionHead title="Próximos lotes" hint={`${upcomingLotes.length} en cola.`} />
                    <div className="mt-3">
                      <ConsolaUpcomingLotesPanel lotes={upcomingLotes} selectedLoteId={null} onSelect={noop} selectionEnabled={false} />
                    </div>
                  </section>
                  <section aria-label="Lotes desiertos">
                    <SectionHead title="Lotes desiertos" hint="Sin ofertas. Podés volver a rematarlos." />
                    <div className="mt-3">
                      <ConsolaDesiertoLotesPanel remateId={remate.id} lotes={desiertoLotes} currency={currency} canUseCustomPrice />
                    </div>
                  </section>
                </div>
              )}

              {tab === 'equipo' && (
                <div className="grid gap-6 lg:grid-cols-2">
                  <OperatorCodePanel remate={remate} />
                  <StreamPanel remate={remate} onChange={onRemateChange} />
                  {remate.access_type === 'private' && <PrivateAccessPanel remate={remate} />}
                </div>
              )}

              {tab === 'analisis' && (
                <AnalyticsPanel remateId={remate.id} subscribeToRealtime={subscribeToRealtime} currency={currency} />
              )}
            </div>
          </main>

          <aside aria-label="Ofertas, preguntas y chat" className="min-w-0 xl:border-l xl:border-line xl:pl-8">
            <div className="xl:sticky xl:top-[4.75rem] xl:flex xl:h-[calc(100vh-6rem)] xl:flex-col">
              <EmpresaRail
                remateId={remate.id}
                subscribeToRealtime={subscribeToRealtime}
                currentUserId={currentUserId}
                connectedUsers={connectedUsers}
                winningOffer={winningOffer}
                recentOffers={recentOffers}
                currency={currency}
                buyerQuestions={buyerQuestions}
              />
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="min-w-0 px-5 py-4 first:pl-0">
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className="mt-1 truncate text-2xl font-semibold tracking-tight tabular-nums text-ink">{value}</dd>
      {hint && <dd className="mt-0.5 truncate text-xs text-ink-faint">{hint}</dd>}
    </div>
  );
}

function AlertList({ alerts }: { alerts: Array<{ id: string; level: 'warning' | 'info'; title: string; detail: string }> }) {
  if (alerts.length === 0) {
    return <p className="text-sm text-ink-muted">Todo en orden: nada requiere tu atención ahora.</p>;
  }
  return (
    <ul className="divide-y divide-line">
      {alerts.map((alert) => (
        <li key={alert.id} className="flex gap-3 py-3">
          {alert.level === 'warning' ? (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning-600" aria-hidden="true" />
          ) : (
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-ink-faint" aria-hidden="true" />
          )}
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink">{alert.title}</p>
            <p className="text-sm text-ink-muted">{alert.detail}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

function Hero({
  activeLote,
  leadAmount,
  winningOffer,
  lastOfferAge,
  currency,
  hasUpcoming,
}: {
  activeLote: Lote | null;
  leadAmount: string | null;
  winningOffer: OfertaSnapshotEntry | null;
  lastOfferAge: number | null;
  currency: string;
  hasUpcoming: boolean;
}) {
  if (!activeLote) {
    return (
      <section aria-label="Lote en remate" className="rounded-3xl bg-ink p-8 text-white sm:p-10">
        <p className="text-sm text-white/60">Entre lotes</p>
        <p className="mt-2 text-3xl font-semibold tracking-tight">
          {hasUpcoming ? 'Sin lote activo en este momento' : 'No quedan lotes por abrir'}
        </p>
        <p className="mt-2 max-w-xl text-white/65">
          {hasUpcoming
            ? 'El martillero abre el siguiente lote desde su consola.'
            : 'Revisá los lotes desiertos o esperá a que el martillero finalice el remate.'}
        </p>
      </section>
    );
  }

  const base = Number(activeLote.base_price);
  const lead = winningOffer ? Number(winningOffer.amount) : null;
  const overBase = lead !== null && base > 0 ? `+${Math.round(((lead - base) / base) * 100)} % sobre la base` : 'Sin ofertas todavía';
  const image = activeLote.images[0]?.url;

  return (
    <section aria-label="Lote en remate" className="overflow-hidden rounded-3xl bg-ink text-white">
      <div className="grid lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <div className="relative min-h-[14rem] bg-white/5 lg:min-h-full">
          {image && <img src={image} alt={activeLote.title} className="absolute inset-0 h-full w-full object-cover" />}
          <div className="absolute inset-0 bg-gradient-to-t from-ink/80 via-transparent to-transparent lg:bg-gradient-to-r lg:from-transparent lg:via-transparent lg:to-ink" />
          <span className="absolute left-5 top-5 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-ink backdrop-blur">
            Lote {activeLote.lot_number} en remate
          </span>
        </div>

        <div className="flex min-w-0 flex-col gap-6 p-6 sm:p-8 lg:pl-4">
          <div>
            <p className="line-clamp-2 text-balance text-lg font-medium text-white/80">{activeLote.title}</p>
            <p className="mt-4 text-xs text-white/55">Oferta líder</p>
            <p className="text-5xl font-semibold tracking-tight tabular-nums sm:text-6xl">{leadAmount ?? '—'}</p>
            <p className="mt-1 text-sm tabular-nums text-white/65">{overBase}</p>
          </div>

          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 border-t border-white/10 pt-4 sm:grid-cols-3">
            <HeroFact label="Precio base" value={formatCurrency(activeLote.base_price, currency)} />
            <HeroFact label="Incremento mínimo" value={formatCurrency(activeLote.min_increment, currency)} />
            <HeroFact label="Última oferta" value={lastOfferAge !== null ? agoLabel(lastOfferAge) : '—'} />
          </dl>
        </div>
      </div>
    </section>
  );
}

function HeroFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-white/55">{label}</dt>
      <dd className="mt-0.5 truncate text-sm font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
