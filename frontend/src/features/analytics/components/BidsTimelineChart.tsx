import { formatDateShort, formatDateTimeCompact, formatTime } from '../../../shared/lib/format';
import type { BidsTimelineBucket, BidsTimelineGranularity } from '../types';

const CHART_HEIGHT = 80;
/** Ancho mínimo por bucket (px) cuando hay muchos -- remates Timed de varios días pueden
 * tener 100+ buckets horarios, y comprimirlos todos al ancho del viewport los vuelve
 * ilegibles. El contenedor scrollea horizontalmente en vez de eso. */
const MIN_HOURLY_BAR_PX = 6;
const MIN_HOURLY_CHART_PX = 320;

export interface BidsTimelineChartProps {
  buckets: BidsTimelineBucket[];
  granularity: BidsTimelineGranularity;
}

/** Clave de día calendario (zona horaria local del navegador, misma que el resto de
 * `format.ts`) -- agrupa buckets horarios para dibujar separadores de día. */
function dayKey(iso: string): string {
  const date = new Date(iso);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

interface DayBoundary {
  index: number;
  label: string;
}

/** El primer bucket de cada día nuevo (el primer bucket del gráfico entero también
 * cuenta, para que el primer día también tenga su etiqueta). */
function computeDayBoundaries(buckets: BidsTimelineBucket[]): DayBoundary[] {
  const boundaries: DayBoundary[] = [];
  let lastKey = '';
  buckets.forEach((bucket, index) => {
    const key = dayKey(bucket.bucket_start);
    if (key !== lastKey) {
      boundaries.push({ index, label: formatDateShort(bucket.bucket_start) });
      lastKey = key;
    }
  });
  return boundaries;
}

/** Altura de un bucket dentro del viewport (0 = línea de base, `CHART_HEIGHT` = techo).
 * Piso de 2 unidades incluso en 0 ofertas -- mismo criterio que la versión de barras: un
 * bucket sin ofertas se ve como un tramo de línea pegado a la base, no desaparece (evita
 * confundir "sin datos" con "sin actividad"). */
function bucketY(bucket: BidsTimelineBucket, maxCount: number): number {
  return CHART_HEIGHT - Math.max(2, (bucket.count / maxCount) * (CHART_HEIGHT - 4));
}

/** Posición X (0-100) del punto de un bucket a lo largo de la línea -- a diferencia del
 * ancho de columna usado para las áreas de hover (`barWidth`), el primer punto queda en
 * el borde izquierdo y el último en el derecho (0 y 100), como cualquier gráfico de
 * línea/área. */
function pointX(index: number, count: number): number {
  return count <= 1 ? 50 : (index / (count - 1)) * 100;
}

/** Gráfico de línea/área simple, a mano (sin librería nueva -- ADR-027) para la
 * evolución de ofertas. Zero-filled del lado del backend (un bucket sin ofertas se ve
 * como un tramo de línea pegado a la base, no desaparece -- evita confundir "sin datos"
 * con "sin actividad"). Dos modos, según `granularity` (ver
 * `AnalyticsService._resolve_timeline_window` en el backend):
 * - `'minute'` (remates LIVE): una sola serie de minutos, comportamiento preexistente.
 * - `'hour'` (remates TIMED, pueden durar varios días): agrupa visualmente por día, con
 *   un separador y una etiqueta de fecha en cada cambio de día, y scroll horizontal
 *   cuando hay más barras de las que entran cómodas en el ancho disponible.
 *
 * El tooltip por bucket (`<title>`) vive en un `<rect>` transparente por columna, no en
 * la línea/área visible -- así el área de hover cubre todo el ancho de cada bucket en
 * vez de solo los pocos píxeles del trazo. `pointerEvents="all"` es necesario porque un
 * relleno transparente, por default, no recibe eventos de puntero en SVG
 * (`pointer-events: visiblePainted`, el valor inicial, solo dispara sobre píxeles
 * pintados). */
export function BidsTimelineChart({ buckets, granularity }: BidsTimelineChartProps) {
  if (buckets.length === 0) {
    return <p className="py-6 text-center text-sm text-slate-400">Todavía no hay ofertas.</p>;
  }

  const isHourly = granularity === 'hour';
  const maxCount = Math.max(1, ...buckets.map((bucket) => bucket.count));
  const barWidth = 100 / buckets.length;

  const points = buckets.map((bucket, index) => ({
    x: pointX(index, buckets.length),
    y: bucketY(bucket, maxCount),
  }));
  const linePath = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x},${point.y}`).join(' ');
  const areaPath = `${linePath} L ${points[points.length - 1].x},${CHART_HEIGHT} L ${points[0].x},${CHART_HEIGHT} Z`;

  const dayBoundaries = isHourly ? computeDayBoundaries(buckets) : [];

  const tickEvery = Math.max(1, Math.ceil(buckets.length / 5));
  const minuteTicks = buckets.filter(
    (_, index) => index % tickEvery === 0 || index === buckets.length - 1,
  );

  const chartMinWidthPx = isHourly
    ? Math.max(MIN_HOURLY_CHART_PX, buckets.length * MIN_HOURLY_BAR_PX)
    : null;

  return (
    <div className={isHourly ? 'overflow-x-auto' : undefined}>
      <div
        className="flex flex-col gap-1"
        style={chartMinWidthPx != null ? { minWidth: `${chartMinWidthPx}px` } : undefined}
      >
        <svg
          viewBox={`0 0 100 ${CHART_HEIGHT}`}
          preserveAspectRatio="none"
          className="h-20 w-full"
          role="img"
          aria-label={
            isHourly ? 'Evolución de ofertas por hora, por día' : 'Evolución de ofertas por minuto'
          }
        >
          <rect x="0" y={CHART_HEIGHT - 2} width="100" height="2" className="fill-slate-200" />
          <path d={areaPath} className="fill-brand-500/10" data-testid="bids-timeline-area" />
          <path
            d={linePath}
            className="fill-none stroke-brand-500"
            strokeWidth={1.5}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            data-testid="bids-timeline-line"
          />
          {isHourly &&
            dayBoundaries
              .filter((boundary) => boundary.index > 0)
              .map((boundary) => (
                <rect
                  key={`sep-${boundary.index}`}
                  x={pointX(boundary.index, buckets.length)}
                  y="0"
                  width="0.3"
                  height={CHART_HEIGHT}
                  className="fill-slate-300"
                />
              ))}
          {buckets.map((bucket, index) => (
            <rect
              key={bucket.bucket_start}
              x={index * barWidth}
              y="0"
              width={barWidth}
              height={CHART_HEIGHT}
              className="fill-transparent"
              pointerEvents="all"
            >
              <title>
                {isHourly
                  ? formatDateTimeCompact(bucket.bucket_start)
                  : formatTime(bucket.bucket_start)}{' '}
                -- {bucket.count} {bucket.count === 1 ? 'oferta' : 'ofertas'}
              </title>
            </rect>
          ))}
        </svg>
        <div className="relative h-3 text-[10px] text-slate-400">
          {isHourly ? (
            dayBoundaries.map((boundary, index) => (
              <span
                key={boundary.index}
                className={`absolute whitespace-nowrap ${index === 0 ? '' : '-translate-x-1/2'}`}
                style={{ left: `${pointX(boundary.index, buckets.length)}%` }}
              >
                {boundary.label}
              </span>
            ))
          ) : (
            <div className="flex justify-between">
              {minuteTicks.map((tick) => (
                <span key={tick.bucket_start}>{formatTime(tick.bucket_start)}</span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
