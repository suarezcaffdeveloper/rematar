import { formatCompactMoney } from '../../../rematador/dashboard';
import { STATUS_LABELS } from '../../labels';
import { SALES_CURRENCY, type SalesTotals } from '../../sales';

// Una sola tonalidad, de claro a oscuro, en el orden del flujo (más avanzado = más oscuro).
const STAGE_COLORS = ['#c6d2fc', '#9db3fa', '#6e8bf7', '#3f64f4', '#2451f2', '#1b3fc4', '#16339c', '#142c7d'];

function money(amount: number): string {
  return formatCompactMoney(amount, SALES_CURRENCY);
}

/**
 * Cómo van las ventas: cuatro cifras en una franja abierta (línea `ink` arriba, columnas
 * separadas por `line`) y debajo una barra con el monto de cada etapa del flujo. La barra es
 * una sola serie en una sola tonalidad, y su leyenda dice cantidad y monto de cada etapa con
 * texto -- el color nunca es lo único que informa.
 */
export function SalesNumbers({ totals }: { totals: SalesTotals }) {
  const total = totals.byStage.reduce((acc, stage) => acc + stage.sum, 0);
  const items = [
    { value: money(totals.unpaidSum), label: 'Sin cobrar', detail: `${totals.unpaidCount} ${totals.unpaidCount === 1 ? 'venta' : 'ventas'}` },
    {
      value: money(totals.paid30Sum),
      label: 'Cobrado en 30 días',
      detail: `${totals.paid30Count} ${totals.paid30Count === 1 ? 'venta con pago registrado' : 'ventas con pago registrado'}`,
    },
    { value: String(totals.wayCount), label: 'En camino', detail: 'pagadas, en preparación o enviadas' },
    {
      value: String(totals.lateCount),
      label: totals.lateCount === 1 ? 'Venta atrasada' : 'Ventas atrasadas',
      detail: totals.lateCount > 0 ? `${money(totals.lateSum)} detenidos` : 'todo dentro de lo normal',
    },
  ];

  return (
    <div>
      <dl className="grid grid-cols-2 border-t border-ink lg:grid-cols-4">
        {items.map((item) => (
          <div
            key={item.label}
            className="flex flex-col gap-1.5 border-b border-line py-6 pr-4 lg:border-b-0 lg:border-l lg:px-6 lg:first:border-l-0 lg:first:pl-0"
          >
            <dd className="order-1 text-3xl font-semibold leading-none tracking-tight tabular-nums sm:text-4xl lg:text-5xl">{item.value}</dd>
            <dt className="order-2 mt-1 font-semibold">{item.label}</dt>
            <dd className="order-3 text-sm text-ink-muted">{item.detail}</dd>
          </div>
        ))}
      </dl>

      {total > 0 && (
        <figure className="mt-9">
          <figcaption className="mb-3 font-semibold">
            El camino de tus {totals.byStage.reduce((acc, stage) => acc + stage.count, 0)} ventas, por monto ({money(total)})
          </figcaption>
          <div className="flex h-3.5 gap-0.5 overflow-hidden rounded-full" role="img" aria-label="Monto de las ventas por etapa">
            {totals.byStage.map((stage, index) =>
              stage.sum > 0 ? (
                <span key={stage.status} title={`${STATUS_LABELS[stage.status]}: ${money(stage.sum)}`} className="block min-w-1.5" style={{ flex: stage.sum, background: STAGE_COLORS[index] }} />
              ) : null,
            )}
          </div>
          <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm">
            {totals.byStage.map((stage, index) =>
              stage.count > 0 ? (
                <li key={stage.status} className="inline-flex items-center gap-2 text-ink-muted">
                  <span aria-hidden="true" className="h-2.5 w-2.5 rounded-[3px]" style={{ background: STAGE_COLORS[index] }} />
                  <b className="font-semibold tabular-nums text-ink">{stage.count}</b> {STATUS_LABELS[stage.status]} · {money(stage.sum)}
                </li>
              ) : null,
            )}
          </ul>
        </figure>
      )}
    </div>
  );
}
