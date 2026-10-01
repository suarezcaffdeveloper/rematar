import { formatCompactMoney, type MonthlyResults } from '../../dashboard';

export interface MonthlyNumbersProps {
  results: MonthlyResults;
  /** Texto de "por cobrar" (por ejemplo "3 · $ 27,4 M"), `null` si no hay ventas esperando el pago. */
  pendingSalesLabel: string | null;
}

/**
 * Los números del último mes en una franja abierta (línea `ink` arriba, columnas separadas
 * por `line`): cifras grandes con su rótulo, sin tarjetas. Calculados del historial de
 * remates finalizados -- no hay un endpoint de totales entre remates.
 */
export function MonthlyNumbers({ results, pendingSalesLabel }: MonthlyNumbersProps) {
  const soldPercent = results.lotesTotal > 0 ? Math.round((results.lotesSold / results.lotesTotal) * 100) : 0;
  const items = [
    {
      value: formatCompactMoney(results.revenue, results.currency),
      label: 'Recaudación',
      detail: results.hasOtherCurrencies ? `Solo en ${results.currency}; hay remates en otras monedas` : 'Adjudicado en remates cerrados',
    },
    {
      value: String(results.closedRemates),
      label: results.closedRemates === 1 ? 'Remate cerrado' : 'Remates cerrados',
      detail: 'Finalizados en los últimos 30 días',
    },
    { value: `${soldPercent}%`, label: 'Lotes vendidos', detail: `${results.lotesSold} de ${results.lotesTotal} lotes` },
    {
      value: pendingSalesLabel ?? '—',
      label: 'Por cobrar',
      detail: pendingSalesLabel ? 'Ventas adjudicadas sin pago' : 'No hay ventas esperando el pago',
    },
  ];

  return (
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
  );
}
