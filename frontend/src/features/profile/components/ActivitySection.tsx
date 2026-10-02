import { formatCompactMoney } from '../../rematador/dashboard';
import type { BuyerActivityStats } from '../mockActivity';

export interface ActivitySectionProps {
  stats: BuyerActivityStats;
}

/**
 * "Tu actividad" (comprador): cuatro cifras en la franja editorial que usan Historial y
 * Ventas (línea `ink` arriba, cifra grande, nombre y detalle). Sin gráficos ni tendencias:
 * son totales acumulados, no un dashboard.
 */
export function ActivitySection({ stats }: ActivitySectionProps) {
  const items = [
    { value: String(stats.rematesParticipados), label: 'Remates participados', detail: 'desde que te sumaste' },
    { value: String(stats.ofertasRealizadas), label: 'Ofertas realizadas', detail: 'en todos tus remates' },
    {
      value: String(stats.lotesAdjudicados),
      label: 'Lotes adjudicados',
      detail: `ganaste ${stats.lotesAdjudicados} de ${stats.rematesParticipados} remates`,
    },
    {
      value: formatCompactMoney(Number(stats.totalAdjudicado), stats.currency),
      label: 'Total adjudicado',
      detail: stats.currency === 'ARS' ? 'en pesos argentinos' : `en ${stats.currency}`,
    },
  ];

  return (
    <section aria-label="Tu actividad" className="mt-14">
      <dl className="grid grid-cols-2 border-t border-ink lg:grid-cols-4">
        {items.map((item) => (
          <div
            key={item.label}
            className="flex flex-col gap-1.5 border-b border-line py-6 pr-4 lg:border-b-0 lg:border-l lg:px-6 lg:first:border-l-0 lg:first:pl-0"
          >
            <dd className="order-1 text-3xl font-semibold leading-none tracking-tight tabular-nums sm:text-4xl lg:text-5xl">
              {item.value}
            </dd>
            <dt className="order-2 mt-1 font-semibold">{item.label}</dt>
            <dd className="order-3 text-sm text-ink-muted">{item.detail}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
