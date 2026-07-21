import { formatTime } from '../../../shared/lib/format';
import type { BidsTimelineBucket } from '../types';

const CHART_HEIGHT = 80;
const BAR_GAP = 1.5;

export interface BidsTimelineChartProps {
  buckets: BidsTimelineBucket[];
}

/** Gráfico de barras simple, a mano (sin librería nueva -- ADR-027) para la evolución
 * de ofertas por minuto. Una sola serie, zero-filled del lado del backend (un minuto
 * sin ofertas se ve como una barra mínima, no desaparece). */
export function BidsTimelineChart({ buckets }: BidsTimelineChartProps) {
  if (buckets.length === 0) {
    return <p className="py-6 text-center text-sm text-slate-400">Todavía no hay ofertas.</p>;
  }

  const maxCount = Math.max(1, ...buckets.map((bucket) => bucket.count));
  const barWidth = 100 / buckets.length;
  const tickEvery = Math.max(1, Math.ceil(buckets.length / 5));
  const ticks = buckets.filter(
    (_, index) => index % tickEvery === 0 || index === buckets.length - 1,
  );

  return (
    <div className="flex flex-col gap-1">
      <svg
        viewBox={`0 0 100 ${CHART_HEIGHT}`}
        preserveAspectRatio="none"
        className="h-20 w-full"
        role="img"
        aria-label="Evolución de ofertas por minuto"
      >
        <rect x="0" y={CHART_HEIGHT - 2} width="100" height="2" className="fill-slate-200" />
        {buckets.map((bucket, index) => {
          const barHeight = Math.max(2, (bucket.count / maxCount) * (CHART_HEIGHT - 4));
          return (
            <rect
              key={bucket.bucket_start}
              x={index * barWidth + BAR_GAP / 2}
              y={CHART_HEIGHT - barHeight}
              width={Math.max(0.5, barWidth - BAR_GAP)}
              height={barHeight}
              className="fill-brand-500"
            >
              <title>
                {formatTime(bucket.bucket_start)} -- {bucket.count}{' '}
                {bucket.count === 1 ? 'oferta' : 'ofertas'}
              </title>
            </rect>
          );
        })}
      </svg>
      <div className="flex justify-between text-[10px] text-slate-400">
        {ticks.map((tick) => (
          <span key={tick.bucket_start}>{formatTime(tick.bucket_start)}</span>
        ))}
      </div>
    </div>
  );
}
