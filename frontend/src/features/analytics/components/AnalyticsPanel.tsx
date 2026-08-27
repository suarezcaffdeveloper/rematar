import { Alert } from '../../../shared/components/Alert';
import { Card } from '../../../shared/components/Card';
import { Skeleton } from '../../../shared/components/Skeleton';
import { formatCurrency, formatDuration } from '../../../shared/lib/format';
import { useRemateAnalytics } from '../hooks';
import { BidsTimelineChart } from './BidsTimelineChart';
import { EventsTimeline } from './EventsTimeline';
import { ChartBarIcon } from './icons';
import { StatCard } from '../../../shared/components/StatCard';

export interface AnalyticsPanelProps {
  remateId: string;
  subscribeToRealtime: (listener: (message: unknown) => void) => () => void;
  currency: string;
}

/**
 * Panel de analítica en tiempo real (Épica 7, Módulo 7.1) -- exclusivo de la Consola
 * Operativa del rematador (el backend igual lo exige: `AnalyticsService.build` deniega
 * con 403 a cualquiera que no sea dueño o admin). Reusa `subscribeToRealtime`
 * (`useLiveRemateState`, `features/sala/hooks.ts`) para no abrir una segunda conexión
 * WebSocket -- mismo patrón que `ChatPanel`.
 */
export function AnalyticsPanel({ remateId, subscribeToRealtime, currency }: AnalyticsPanelProps) {
  const { data, isInitialLoading, initialError } = useRemateAnalytics(
    remateId,
    subscribeToRealtime,
  );

  const lotesRestantes = data ? data.lote_status_counts.pending + data.lote_status_counts.open : 0;

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
        <ChartBarIcon className="h-4 w-4 text-slate-400" />
        Analítica en tiempo real
      </div>

      {isInitialLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 8 }, (_, index) => (
            <Skeleton key={index} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : initialError || !data ? (
        <Alert variant="error">No se pudo cargar la analítica de este remate.</Alert>
      ) : (
        <>
          {/* `centered` (auditoría mobile -- a 320px, 2 columnas dejaban ~130px por
           * tarjeta, muy poco para etiquetas como "Compradores conectados" en una sola
           * línea: truncaban a "COMPRAD..."): la variante centrada de `StatCard` deja
           * que la etiqueta pase a un segundo renglón en vez de truncarse, pensada
           * justo para grillas densas de KPIs como esta -- ver su prop `centered`. */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard
              centered
              label="Compradores conectados"
              value={data.connected_buyers}
              formattedValue={String(data.connected_buyers)}
            />
            <StatCard
              centered
              label="Usuarios activos"
              value={data.connected_users_total}
              formattedValue={String(data.connected_users_total)}
            />
            <StatCard
              centered
              label="Ofertas por minuto"
              value={data.ofertas_per_minute}
              formattedValue={String(data.ofertas_per_minute)}
            />
            <StatCard
              centered
              label="Total de ofertas"
              value={data.total_ofertas}
              formattedValue={String(data.total_ofertas)}
            />
            <StatCard
              centered
              label="Lotes vendidos"
              value={data.lote_status_counts.closed_sold}
              formattedValue={String(data.lote_status_counts.closed_sold)}
            />
            <StatCard
              centered
              label="Lotes restantes"
              value={lotesRestantes}
              formattedValue={String(lotesRestantes)}
              showTrend={false}
            />
            <StatCard
              centered
              label="Tiempo promedio por lote"
              value={data.average_lote_duration_seconds ?? 0}
              formattedValue={
                data.average_lote_duration_seconds != null
                  ? formatDuration(data.average_lote_duration_seconds * 1000)
                  : '--'
              }
              showTrend={false}
            />
            <StatCard
              centered
              label="Valor total adjudicado"
              value={Number(data.total_awarded_value)}
              formattedValue={formatCurrency(data.total_awarded_value, currency)}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1 rounded-lg border border-slate-100 p-3">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Oferta más alta del remate
              </span>
              {data.highest_oferta ? (
                <span className="text-lg font-semibold text-slate-900">
                  {formatCurrency(data.highest_oferta.amount, currency)}
                  <span className="ml-1.5 text-sm font-normal text-slate-500">
                    -- Lote {data.highest_oferta.lot_number}
                  </span>
                </span>
              ) : (
                <span className="text-sm text-slate-400">Sin ofertas todavía.</span>
              )}
            </div>
            <div className="flex flex-col gap-1 rounded-lg border border-slate-100 p-3">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Lote con más ofertas
              </span>
              {data.top_lote_by_offers ? (
                <span className="text-lg font-semibold text-slate-900">
                  Lote {data.top_lote_by_offers.lot_number}
                  <span className="ml-1.5 text-sm font-normal text-slate-500">
                    -- {data.top_lote_by_offers.offer_count}{' '}
                    {data.top_lote_by_offers.offer_count === 1 ? 'oferta' : 'ofertas'}
                  </span>
                </span>
              ) : (
                <span className="text-sm text-slate-400">Sin ofertas todavía.</span>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Evolución de ofertas
            </span>
            <BidsTimelineChart buckets={data.bids_timeline} />
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Línea de tiempo
            </span>
            <EventsTimeline events={data.recent_events} />
          </div>
        </>
      )}
    </Card>
  );
}
