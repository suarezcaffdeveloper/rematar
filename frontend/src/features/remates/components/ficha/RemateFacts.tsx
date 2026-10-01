import { formatDateTime } from '../../../../shared/lib/format';
import { guaranteeLabel } from '../../ficha';
import { AUCTION_TYPE_LABELS } from '../../labels';
import type { Remate } from '../../types';

function FactCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-line px-0 py-6 last:border-b-0 sm:odd:pr-6 lg:border-b-0 lg:border-l lg:px-7 lg:first:border-l-0 lg:first:pl-0">
      <dd className="text-xl font-semibold leading-snug tracking-tight">{value}</dd>
      <dt className="mt-1 text-sm text-ink-muted">{label}</dt>
    </div>
  );
}

/** Los datos del remate como una franja de cifras grandes, sin íconos ni cajas: cuándo
 * empieza, de qué tipo es, dónde está y si pide garantía para ofertar. */
export function RemateFacts({ remate }: { remate: Remate }) {
  return (
    <dl className="mt-12 grid border-y border-ink sm:grid-cols-2 lg:grid-cols-4">
      <FactCell label="Inicio" value={remate.starts_at ? formatDateTime(remate.starts_at) : 'A confirmar'} />
      <FactCell label="Tipo de remate" value={AUCTION_TYPE_LABELS[remate.auction_type ?? 'live']} />
      <FactCell label="Ubicación" value={remate.location ?? 'A confirmar'} />
      <FactCell label="Garantía para ofertar" value={guaranteeLabel(remate.settings)} />
    </dl>
  );
}
