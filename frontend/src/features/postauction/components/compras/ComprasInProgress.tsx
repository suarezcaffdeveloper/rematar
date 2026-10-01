import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { getStatusCopy } from '../../buyerStatusCopy';
import { formatShortDate } from '../../comprasUtils';
import { STATUS_LABELS } from '../../labels';
import type { PostAuctionCase } from '../../types';
import { formatCurrency } from '../../../../shared/lib/format';
import { CompraCover } from './CompraCover';
import { ProcessTrack } from './ProcessTrack';
import { statusTone } from './statusTone';

const CURRENCY = 'ARS';

/** "En proceso": una fila editorial por compra, con su foto, el recorrido de 8 pasos, el
 * "qué sigue" en texto claro y el precio. */
export function ComprasInProgress({ compras }: { compras: PostAuctionCase[] }) {
  return (
    <section aria-labelledby="proceso-title" className="mt-12">
      <h2 id="proceso-title" className="mb-6 text-2xl font-semibold tracking-tight">
        En proceso
      </h2>
      <ul className="border-t border-ink">
        {compras.map((compra) => (
          <InProgressRow key={compra.id} compra={compra} />
        ))}
      </ul>
    </section>
  );
}

function InProgressRow({ compra }: { compra: PostAuctionCase }) {
  const needsPayment = compra.status === 'pago_pendiente';
  const to = `/mis-compras/${compra.id}`;
  return (
    <li className="border-b border-line py-8">
      <div className="grid gap-6 lg:grid-cols-[17rem_minmax(0,1fr)_14rem] lg:gap-10">
        <Link
          to={to}
          tabIndex={-1}
          aria-hidden="true"
          className="group block h-48 overflow-hidden rounded-xl bg-surface-subtle lg:h-44"
        >
          <CompraCover
            compra={compra}
            className="h-full w-full transition-transform duration-700 ease-out group-hover:scale-105"
          />
        </Link>

        <div className="min-w-0">
          <p className={`text-sm font-medium ${statusTone(compra.status)}`}>{STATUS_LABELS[compra.status]}</p>
          <h3 className="mt-1 text-2xl font-medium leading-snug tracking-tight sm:text-3xl">{compra.lote_title}</h3>
          <p className="mt-1 text-sm text-ink-muted">
            Lote {compra.lot_number} del remate {compra.remate_title}
          </p>
          <div className="mt-6">
            <ProcessTrack status={compra.status} />
          </div>
          <p className="mt-5 max-w-xl text-sm leading-relaxed text-ink-muted">
            {needsPayment && <strong className="font-semibold text-ink">Te toca a vos. </strong>}
            {getStatusCopy(compra).nextStepDescription}
          </p>
        </div>

        <div className="flex flex-row items-end justify-between gap-4 lg:flex-col lg:items-end lg:justify-between lg:text-right">
          <div>
            <p className="text-3xl font-semibold tabular-nums tracking-tight">
              {formatCurrency(compra.final_price, CURRENCY)}
            </p>
            <p className="mt-1 text-sm text-ink-muted">base {formatCurrency(compra.base_price, CURRENCY)}</p>
            <p className="mt-1 text-sm text-ink-muted">adjudicado el {formatShortDate(compra.created_at)}</p>
          </div>
          <Link
            to={to}
            className={`group inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 ${
              needsPayment ? 'bg-brand-600 hover:bg-brand-500' : 'bg-ink hover:bg-ink/85'
            }`}
          >
            Ver compra
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </li>
  );
}
