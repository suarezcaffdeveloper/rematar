import type { Lote } from '../../../remates/types';
import { formatCompactMoney } from '../../dashboard';
import { computeCatalogNumbers } from '../../preparation';

const MAX_LABELED_BARS = 24;

export interface CatalogNumbersProps {
  lotes: Lote[];
  currency: string;
  /** Al tocar una barra se lleva al lote correspondiente de la galería. */
  onSelectLote: (loteId: string) => void;
}

/**
 * El catálogo en números: cuatro cifras grandes (franja abierta, sin tarjetas) y debajo el
 * precio base de cada lote, en orden de salida. El gráfico es una sola serie con una sola
 * escala (de cero al mayor precio base), marcas finas y la grilla recesiva; cada barra
 * tiene su valor en el tooltip y es un botón que lleva al lote.
 */
export function CatalogNumbers({ lotes, currency, onSelectLote }: CatalogNumbersProps) {
  if (lotes.length === 0) return null;
  const numbers = computeCatalogNumbers(lotes);
  const prices = lotes.map((lote) => Number(lote.base_price) || 0);
  const max = Math.max(...prices, 1);
  const items = [
    { value: String(numbers.count), label: numbers.count === 1 ? 'Lote' : 'Lotes', detail: 'cargados en el remate' },
    { value: formatCompactMoney(numbers.totalBase, currency), label: 'Valor base total', detail: 'suma de los precios iniciales' },
    {
      value: `${numbers.withPhoto} de ${numbers.count}`,
      label: 'Con foto',
      detail: numbers.withoutPhoto > 0 ? `${numbers.withoutPhoto} sin foto` : 'todos con foto',
    },
    {
      value: String(numbers.withReserve),
      label: numbers.withReserve === 1 ? 'Lote con reserva' : 'Lotes con reserva',
      detail: 'precio mínimo de venta',
    },
  ];
  const showLabels = lotes.length <= MAX_LABELED_BARS;

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

      <figure className="mt-8" aria-label="Precio base por lote">
        <figcaption className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <span className="font-semibold">Precio base por lote, en orden de salida</span>
          <span className="text-sm text-ink-muted">Tocá una barra para ir al lote</span>
        </figcaption>
        <div className="relative pl-14">
          <div className="relative flex h-32 items-end gap-1 border-b border-line-strong" role="group">
            {[max, max / 2].map((tick) => (
              <div key={tick} aria-hidden="true" className="pointer-events-none absolute inset-x-0" style={{ bottom: `${(tick / max) * 100}%` }}>
                <span className="absolute -left-14 -translate-y-1/2 text-[11px] tabular-nums text-ink-muted">{formatCompactMoney(tick, currency)}</span>
                <div className="border-t border-dashed border-line" />
              </div>
            ))}
            {lotes.map((lote, index) => (
              <button
                key={lote.id}
                type="button"
                onClick={() => onSelectLote(lote.id)}
                aria-label={`Lote ${lote.lot_number}, precio base ${formatCompactMoney(prices[index], currency)}`}
                className="group relative flex h-full min-w-0 flex-1 items-end focus:outline-none"
              >
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-ink px-2.5 py-1 text-xs font-medium tabular-nums text-white group-hover:block group-focus-visible:block"
                >
                  Lote {lote.lot_number} · {formatCompactMoney(prices[index], currency)}
                </span>
                <span
                  aria-hidden="true"
                  className="block w-full rounded-t bg-brand-200 transition-colors group-hover:bg-brand-600 group-focus-visible:bg-brand-600"
                  style={{ height: `${Math.max(3, (prices[index] / max) * 100)}%` }}
                />
              </button>
            ))}
          </div>
          {showLabels && (
            <div className="mt-1.5 flex gap-1" aria-hidden="true">
              {lotes.map((lote) => (
                <span key={lote.id} className="min-w-0 flex-1 truncate text-center text-[10.5px] text-ink-faint">
                  {lote.lot_number}
                </span>
              ))}
            </div>
          )}
        </div>
      </figure>
    </div>
  );
}
