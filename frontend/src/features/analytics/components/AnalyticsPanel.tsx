import { Alert } from '../../../shared/components/Alert';
import { Badge } from '../../../shared/components/Badge';
import { Card } from '../../../shared/components/Card';
import { Skeleton } from '../../../shared/components/Skeleton';
import { formatCurrency, formatDuration, formatRelativeTime } from '../../../shared/lib/format';
import { exportRecentEventsToCsv } from '../exportEvents';
import { useRemateAnalytics } from '../hooks';
import { BidsTimelineChart } from './BidsTimelineChart';
import { EventsLegend } from './EventsLegend';
import { EventsTimeline } from './EventsTimeline';
import { ChartBarIcon } from './icons';
import { StatCard } from '../../../shared/components/StatCard';

export interface AnalyticsPanelProps {
  remateId: string;
  subscribeToRealtime: (listener: (message: unknown) => void) => () => void;
  currency: string;
}

interface HeroStatProps {
  label: string;
  value: string;
  caption: string;
}

/** Las 3 métricas "destacadas" del remate (valor adjudicado, oferta más alta, lote más
 * competido) -- mismo lenguaje visual que el resto del panel (borde `slate-100`, label
 * en mayúsculas), solo con el valor a `text-2xl` en vez de `text-lg` para que se lean
 * primero: son el resumen ejecutivo del remate, el resto de la grilla es soporte. */
function HeroStat({ label, value, caption }: HeroStatProps) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-slate-100 p-4">
      <span className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</span>
      <span className="text-2xl font-semibold text-slate-900">{value}</span>
      <span className="text-xs text-slate-500">{caption}</span>
    </div>
  );
}

interface LoteProgressCardProps {
  sold: number;
  total: number;
  remaining: number;
}

/** Reemplaza los antiguos "Lotes vendidos"/"Lotes restantes" (dos `StatCard` sueltos)
 * por una única tarjeta con barra de progreso -- mismo dato (`lote_status_counts`), una
 * sola lectura visual de "cuánto falta" en vez de dos números que hay que restar. */
function LoteProgressCard({ sold, total, remaining }: LoteProgressCardProps) {
  const percentage = total > 0 ? Math.round((sold / total) * 100) : 0;
  return (
    <div className="flex flex-col items-center gap-1.5 rounded-xl border border-slate-200 bg-white p-4 text-center">
      <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Progreso de lotes</span>
      <span className="text-lg font-semibold text-slate-900 sm:text-xl">
        {sold}/{total}
        <span className="ml-1 text-sm font-normal text-slate-500">({percentage}%)</span>
      </span>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-brand-500" style={{ width: `${percentage}%` }} />
      </div>
      <span className="text-xs text-slate-500">
        {sold} {sold === 1 ? 'vendido' : 'vendidos'} · {remaining} {remaining === 1 ? 'restante' : 'restantes'}
      </span>
    </div>
  );
}

/**
 * Panel de analítica en tiempo real (Épica 7, Módulo 7.1) -- exclusivo de la Consola
 * Operativa del rematador (el backend igual lo exige: `AnalyticsService.build` deniega
 * con 403 a cualquiera que no sea dueño o admin). Reusa `subscribeToRealtime`
 * (`useLiveRemateState`, `features/sala/hooks.ts`) para no abrir una segunda conexión
 * WebSocket -- mismo patrón que `ChatPanel`.
 *
 * Distribución (rediseño sobre una referencia visual externa, pedido explícito: "quiero
 * mantener los estilos que ya tenemos, pero con esas distribuciones"): 3 métricas
 * destacadas arriba (`HeroStat`), una fila de KPIs chicos + progreso de lotes debajo, y
 * el gráfico de evolución + la línea de tiempo de eventos lado a lado en desktop en vez
 * de apiladas -- todo con los mismos componentes/tokens de color que ya usaba el panel
 * (`Card`, `StatCard`, `Badge`, paleta `slate`/`brand`). No se agregó nada que la
 * referencia mostraba pero el backend no expone (toggle "Histórico", badge de conexión
 * WS "Sincronizado"): el único indicador de frescura es "Actualizado hace Xm", derivado
 * del `generated_at` real del snapshot.
 */
export function AnalyticsPanel({ remateId, subscribeToRealtime, currency }: AnalyticsPanelProps) {
  const { data, isInitialLoading, initialError } = useRemateAnalytics(
    remateId,
    subscribeToRealtime,
  );

  const lotesRestantes = data ? data.lote_status_counts.pending + data.lote_status_counts.open : 0;
  const eventCount = data?.recent_events.length ?? 0;

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <ChartBarIcon className="h-4 w-4 text-slate-400" />
          Analítica en tiempo real
        </div>
        {data && (
          <span className="text-xs text-slate-400">Actualizado {formatRelativeTime(data.generated_at)}</span>
        )}
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
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <HeroStat
              label="Valor total adjudicado"
              value={formatCurrency(data.total_awarded_value, currency)}
              caption={`${data.lote_status_counts.closed_sold} ${
                data.lote_status_counts.closed_sold === 1 ? 'adjudicación cerrada' : 'adjudicaciones cerradas'
              }`}
            />
            <HeroStat
              label="Oferta más alta del remate"
              value={data.highest_oferta ? formatCurrency(data.highest_oferta.amount, currency) : '--'}
              caption={data.highest_oferta ? `Lote ${data.highest_oferta.lot_number}` : 'Sin ofertas todavía.'}
            />
            <HeroStat
              label="Lote más competido"
              value={data.top_lote_by_offers ? `Lote ${data.top_lote_by_offers.lot_number}` : '--'}
              caption={
                data.top_lote_by_offers
                  ? `${data.top_lote_by_offers.offer_count} ${
                      data.top_lote_by_offers.offer_count === 1 ? 'oferta' : 'ofertas'
                    }`
                  : 'Sin ofertas todavía.'
              }
            />
          </div>

          {/* `centered` (auditoría mobile -- a 320px, 2 columnas dejaban ~130px por
           * tarjeta, muy poco para etiquetas como "Compradores conectados" en una sola
           * línea: truncaban a "COMPRAD..."): la variante centrada de `StatCard` deja
           * que la etiqueta pase a un segundo renglón en vez de truncarse, pensada
           * justo para grillas densas de KPIs como esta -- ver su prop `centered`. */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
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
            <LoteProgressCard
              sold={data.lote_status_counts.closed_sold}
              total={data.lote_status_counts.total}
              remaining={lotesRestantes}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
            <div className="flex flex-col gap-2 lg:col-span-3">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                {data.bids_timeline_granularity === 'hour'
                  ? 'Ofertas por hora, por día'
                  : 'Evolución de ofertas'}
              </span>
              <BidsTimelineChart
                buckets={data.bids_timeline}
                granularity={data.bids_timeline_granularity}
              />
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>
                  Promedio por lote:{' '}
                  <span className="text-slate-500">
                    {data.average_lote_duration_seconds != null
                      ? formatDuration(data.average_lote_duration_seconds * 1000)
                      : '--'}
                  </span>
                </span>
                <span>{data.bids_timeline_granularity === 'hour' ? 'Ventana: por hora' : 'Ventana: por minuto'}</span>
              </div>
            </div>

            <div className="flex flex-col gap-2 lg:col-span-2">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                  Línea de tiempo
                  {eventCount > 0 && (
                    <Badge variant="neutral">
                      {eventCount} {eventCount === 1 ? 'evento' : 'eventos'}
                    </Badge>
                  )}
                </span>
                {eventCount > 0 && (
                  <button
                    type="button"
                    onClick={() => exportRecentEventsToCsv(data.recent_events, remateId, currency)}
                    className="text-xs font-medium text-brand-600 hover:text-brand-700"
                  >
                    Exportar
                  </button>
                )}
              </div>
              <EventsTimeline events={data.recent_events} />
              <EventsLegend events={data.recent_events} />
            </div>
          </div>
        </>
      )}
    </Card>
  );
}
