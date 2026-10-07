import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { BarChart3, KeyRound, LayoutDashboard, PackageOpen, type LucideIcon } from 'lucide-react';
import { formatCurrency } from '../../../../shared/lib/format';
import type { ConnectionStatus } from '../../../../shared/websocket/client';
import { useRemateAnalytics } from '../../../analytics/hooks';
import type { OfertaSnapshotEntry } from '../../../sala/types';
import type { Lote, Remate } from '../../../remates/types';
import { useElapsedTime } from '../../hooks';
import { EmpresaRail } from './EmpresaRail';
import { EmpresaTopBar } from './EmpresaTopBar';
import { AnalisisTab } from './AnalisisTab';
import { EquipoTab } from './EquipoTab';
import { LotesTab } from './LotesTab';
import { ResumenTab, type ResumenAlert } from './ResumenTab';
import { useBuyerQuestions } from './useBuyerQuestions';

type TabId = 'resumen' | 'lotes' | 'equipo' | 'analisis';

/** Alto del riel: toda la pantalla menos la barra superior (`h-16`). */
const RAIL_HEIGHT_CLASS = 'xl:h-[calc(100vh-4rem)]';

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
  const [railRequest, setRailRequest] = useState<{ tab: 'preguntas'; nonce: number }>({ tab: 'preguntas', nonce: 0 });
  const [operatorCode, setOperatorCode] = useState<string | null>(null);
  const { data: analytics, initialError: analyticsError } = useRemateAnalytics(remate.id, subscribeToRealtime);
  const firstLoteOpenedAt =
    analytics?.recent_events
      .filter((event) => event.event_type === 'lote.opened')
      .map((event) => event.occurred_at)
      .sort()[0] ?? null;
  const elapsed = useElapsedTime(remate, firstLoteOpenedAt);
  const buyerQuestions = useBuyerQuestions(remate.id, subscribeToRealtime, currentUserId);
  const lastOfferAge = useSecondsSince(winningOffer?.created_at ?? null);

  const isPaused = remate.status === 'paused';
  const hasStream = Boolean(remate.stream_video_id);
  const pendingQuestions = buyerQuestions.pending.length;
  const leadAmount = winningOffer ? formatCurrency(winningOffer.amount, currency) : null;

  const alerts: ResumenAlert[] = [];
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
      detail: 'Los compradores no ven el video de la sala.',
      action: { label: 'Cargar transmisión', target: 'equipo' },
    });
  }
  if (desiertoLotes.length > 0) {
    alerts.push({
      id: 'desiertos',
      level: 'info',
      title: `${desiertoLotes.length} ${desiertoLotes.length === 1 ? 'lote desierto espera' : 'lotes desiertos esperan'} una decisión`,
      detail: 'Podés volver a rematarlos o dejarlos como están.',
      action: { label: 'Ver lotes', target: 'lotes' },
    });
  }
  const urgentAlerts = alerts.filter((alert) => alert.level === 'warning').length;

  const tabs: Array<[TabId, string, LucideIcon, number | string | null]> = [
    ['resumen', 'Resumen', LayoutDashboard, null],
    ['lotes', 'Lotes', PackageOpen, desiertoLotes.length > 0 ? desiertoLotes.length : null],
    ['equipo', 'Equipo y accesos', KeyRound, hasStream ? null : '!'],
    ['analisis', 'Análisis', BarChart3, null],
  ];

  return (
    <div className="-mx-3 -my-4 min-h-screen bg-white font-display text-ink sm:-mx-4 lg:-mx-6">
      <EmpresaTopBar
        remate={remate}
        activeLote={activeLote}
        winningOffer={winningOffer}
        elapsed={elapsed}
        connectionStatus={connectionStatus}
        currency={currency}
        raised={analytics ? formatCurrency(analytics.total_awarded_value, currency) : null}
        connectedUsers={connectedUsers}
        pendingQuestions={pendingQuestions}
        urgentAlerts={urgentAlerts}
        onOpenQuestions={() => setRailRequest((request) => ({ tab: 'preguntas', nonce: request.nonce + 1 }))}
        onOpenAlerts={() => {
          setTab('resumen');
          window.setTimeout(() => document.getElementById('empresa-avisos')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
        }}
      />

      <div className="w-full">
        <div className="grid xl:grid-cols-[minmax(0,1fr)_26rem]">
          <main className="min-w-0 px-3 pb-16 pt-5 sm:px-6 lg:px-10">
            <Hero activeLote={activeLote} leadAmount={leadAmount} winningOffer={winningOffer} lastOfferAge={lastOfferAge} currency={currency} hasUpcoming={upcomingLotes.length > 0} />

            <div
              role="tablist"
              aria-label="Secciones del panel"
              className="mt-8 flex gap-2 overflow-x-auto rounded-2xl border border-line bg-surface-subtle p-1.5"
            >
              {tabs.map(([id, label, Icon, badge]) => (
                <button
                  key={id}
                  role="tab"
                  type="button"
                  aria-selected={tab === id}
                  aria-controls={`empresa-panel-${id}`}
                  onClick={() => setTab(id)}
                  className={clsx(
                    'flex h-11 shrink-0 items-center gap-2.5 rounded-xl px-5 text-base font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 sm:flex-1 sm:justify-center',
                    tab === id ? 'bg-ink text-white shadow-sm' : 'text-ink-muted hover:bg-white hover:text-ink',
                  )}
                >
                  <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
                  {label}
                  {badge !== null && (
                    <span className="rounded-full bg-warning-100 px-1.5 text-xs font-semibold tabular-nums text-warning-800">{badge}</span>
                  )}
                </button>
              ))}
            </div>

            <div id={`empresa-panel-${tab}`} role="tabpanel" className="pt-8">
              {tab === 'resumen' && (
                <ResumenTab
                  remateId={remate.id}
                  analytics={analytics ?? null}
                  alerts={alerts}
                  upcomingLotes={upcomingLotes}
                  currency={currency}
                  onGoTo={setTab}
                />
              )}

              {tab === 'lotes' && (
                <LotesTab
                  remateId={remate.id}
                  closedSold={analytics?.lote_status_counts.closed_sold}
                  upcomingLotes={upcomingLotes}
                  desiertoLotes={desiertoLotes}
                  currency={currency}
                />
              )}

              {tab === 'equipo' && (
                <EquipoTab
                  remate={remate}
                  operatorCode={operatorCode}
                  onOperatorCodeChange={setOperatorCode}
                  onRemateChange={onRemateChange}
                />
              )}

              {tab === 'analisis' && (
                <AnalisisTab remateId={remate.id} analytics={analytics ?? null} hasError={Boolean(analyticsError)} currency={currency} />
              )}
            </div>
          </main>

          <aside
            aria-label="Ofertas, preguntas y chat"
            className={`min-w-0 border-t border-line px-3 py-6 sm:px-6 xl:sticky xl:top-16 xl:self-start xl:border-l xl:border-t-0 xl:p-0 ${RAIL_HEIGHT_CLASS}`}
          >
            <EmpresaRail
              remateId={remate.id}
              subscribeToRealtime={subscribeToRealtime}
              currentUserId={currentUserId}
              connectedUsers={connectedUsers}
              winningOffer={winningOffer}
              recentOffers={recentOffers}
              currency={currency}
              buyerQuestions={buyerQuestions}
              request={railRequest}
            />
          </aside>
        </div>
      </div>
    </div>
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
