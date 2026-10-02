import { Link } from 'react-router-dom';
import { Button } from '../../../../shared/components/Button';
import { formatCurrency } from '../../../../shared/lib/format';
import { STATUS_ORDER } from '../../labels';
import { NEXT_ACTIONS, SALES_CURRENCY, daysInState, describeDays, describeLate, statusIndex } from '../../sales';
import type { PostAuctionCase } from '../../types';
import { LatePill, SaleStatusPill } from './SaleStatusPill';
import { SaleCover } from './SaleCover';

export interface SaleCardProps {
  item: PostAuctionCase;
  now: number;
  onAdvance: (item: PostAuctionCase) => void;
}

/**
 * Una venta en la galería: foto grande con estado y, si corresponde, "Atrasada"; lote,
 * comprador, precio final, la ruta de 8 tramos (los hechos en tinta, el actual en azul o
 * ámbar si está atrasada) y una frase de qué sigue con su botón. Mismo patrón que
 * `RematadorRemateCard` del panel principal. Perspectiva de la empresa: los datos del
 * comprador y las acciones son solo de ella (el comprador usa `PurchaseSummaryCard`).
 */
export function SaleCard({ item, now, onAdvance }: SaleCardProps) {
  const late = describeLate(item, now);
  const index = statusIndex(item.status);
  const next = NEXT_ACTIONS[item.status];
  const to = `/ventas-adjudicadas/${item.id}`;

  return (
    <article className="flex min-w-0 flex-col">
      <Link to={to} aria-label={`Abrir venta del lote ${item.lot_number}: ${item.lote_title}`} className="group relative block aspect-[16/10] overflow-hidden rounded-2xl bg-surface-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2">
        <SaleCover url={item.lote_cover_image_url} className="h-full w-full transition-transform duration-700 ease-out group-hover:scale-105" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink/55 via-transparent to-transparent" />
        <span className="absolute left-3 top-3">
          <SaleStatusPill status={item.status} className="bg-white shadow-sm" />
        </span>
        {late && (
          <span className="absolute right-3 top-3">
            <LatePill text="Atrasada" className="shadow-sm" />
          </span>
        )}
        <span className="absolute bottom-3 left-3.5 text-sm font-semibold text-white">Lote {item.lot_number}</span>
      </Link>

      <h3 className="mt-3.5 line-clamp-2 text-xl font-semibold leading-snug tracking-tight">{item.lote_title}</h3>
      <p className="mt-1 text-sm text-ink-muted">
        {item.buyer_name ?? 'Comprador sin nombre'} · {item.remate_title}
      </p>
      <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">
        {formatCurrency(item.final_price, SALES_CURRENCY)}
        <span className="ml-2 text-sm font-medium tracking-normal text-ink-muted">precio final</span>
      </p>

      <div className="mt-3.5 grid grid-cols-8 gap-[3px]" role="img" aria-label={`Etapa ${index + 1} de ${STATUS_ORDER.length}`}>
        {STATUS_ORDER.map((status, i) => (
          <span
            key={status}
            className={`h-1 rounded-full ${i < index ? 'bg-ink' : i === index ? (late ? 'bg-warning-500' : 'bg-brand-600') : 'bg-line-strong'}`}
          />
        ))}
      </div>

      <p className={`mt-3 flex-1 text-sm leading-relaxed ${late ? 'font-semibold text-danger-600' : 'text-ink'}`}>
        {late
          ? `${late}.`
          : next
            ? `En este estado ${daysInState(item, now) === 0 ? 'desde hoy' : `hace ${describeDays(daysInState(item, now))}`}. ${next.hint}`
            : 'Venta cerrada: pago, entrega y documentación resueltos.'}
      </p>

      <div className="mt-4 flex items-center gap-2">
        {next ? (
          <>
            <Button variant={late ? 'primary' : 'hero'} className="h-10 flex-1 justify-center rounded-full px-4" onClick={() => onAdvance(item)}>
              {next.label}
            </Button>
            <Link
              to={to}
              className="inline-flex h-10 shrink-0 items-center rounded-full border border-line-strong px-4 text-sm font-semibold transition-colors hover:border-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              Ver
            </Link>
          </>
        ) : (
          <Link
            to={to}
            className="inline-flex h-10 flex-1 items-center justify-center rounded-full border border-line-strong px-4 text-sm font-semibold transition-colors hover:border-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            Ver detalle
          </Link>
        )}
      </div>
    </article>
  );
}
