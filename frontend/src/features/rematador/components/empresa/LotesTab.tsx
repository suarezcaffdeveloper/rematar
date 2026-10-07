import { useState } from 'react';
import { formatCurrency } from '../../../../shared/lib/format';
import { LoteHistoryDrawer } from '../../../history/components/LoteHistoryDrawer';
import { LoteHistoryRow } from '../../../history/components/LoteHistoryRow';
import { useLoteResultsForRemate } from '../../../history/hooks';
import { risePercent } from '../../../history/summary';
import { CoverPlaceholder } from '../../../remates/components/CoverPlaceholder';
import { BoxIcon } from '../../../remates/components/icons';
import type { Lote } from '../../../remates/types';
import { DesiertoLoteCard } from '../ConsolaDesiertoLotesPanel';
import { CollapsibleSection } from './CollapsibleSection';
import { useRemateLotes } from './useRemateLotes';

export interface LotesTabProps {
  remateId: string;
  /** `lote_status_counts.closed_sold` de la analítica: avisa cuándo hay una adjudicación nueva. */
  closedSold: number | undefined;
  upcomingLotes: Lote[];
  desiertoLotes: Lote[];
  currency: string;
}

function Empty({ children }: { children: string }) {
  return <p className="border-t border-line py-6 text-sm text-ink-muted">{children}</p>;
}

function UpcomingRow({ lote, position, currency }: { lote: Lote; position: number; currency: string }) {
  const image = [...lote.images].sort((a, b) => a.order - b.order)[0];
  return (
    <li className="grid grid-cols-[1.75rem_3.4rem_minmax(0,1fr)_auto] items-center gap-x-4 border-b border-line py-3.5">
      <span className="text-sm font-semibold tabular-nums text-ink-faint">{position}</span>
      <span className="block h-[42px] w-[54px] overflow-hidden rounded-[10px]">
        {image ? (
          <img src={image.url} alt="" className="h-full w-full object-cover" />
        ) : (
          <CoverPlaceholder className="h-full w-full" icon={<BoxIcon className="h-5 w-5 text-brand-300" />} />
        )}
      </span>
      <span className="min-w-0">
        <b className="block truncate text-[15px] font-semibold tracking-tight">
          Lote {lote.lot_number} · {lote.title}
        </b>
        {position === 1 && <span className="text-xs font-semibold text-brand-700">Es el siguiente en abrirse</span>}
      </span>
      <span className="text-right text-sm tabular-nums">
        <b className="block font-semibold">{formatCurrency(lote.base_price, currency)}</b>
        <span className="text-xs text-ink-muted">precio base</span>
      </span>
    </li>
  );
}

/**
 * Pestaña "Lotes" de la Cabina: tres apartados apilados, cada uno plegable. Primero los
 * desiertos (piden una decisión: volver a rematarlos con otro precio), después los próximos
 * en la cola y al final los adjudicados, con su precio base, precio final, % sobre la base,
 * ofertas y ganador (`LoteHistoryRow`, el mismo del Historial).
 */
export function LotesTab({ remateId, closedSold, upcomingLotes, desiertoLotes, currency }: LotesTabProps) {
  const { lotes, isLoading } = useRemateLotes(remateId, closedSold);
  const sold = lotes.filter((lote) => lote.status === 'closed_sold');
  const { data: offerResults } = useLoteResultsForRemate(remateId, sold);
  const [openLote, setOpenLote] = useState<Lote | null>(null);

  const maxRise = Math.max(5, ...sold.map((lote) => risePercent(lote) ?? 0));
  const soldTotal = sold.reduce((sum, lote) => sum + (Number(lote.final_price) || 0), 0);

  return (
    <div className="flex flex-col">
      <CollapsibleSection
        title="Desiertos"
        count={desiertoLotes.length}
        attention
        defaultOpen={desiertoLotes.length > 0}
        hint="Cerraron sin ofertas. Podés volver a rematarlos con otro precio: pasan al final de la cola."
      >
        {desiertoLotes.length === 0 ? (
          <Empty>No hay lotes desiertos. Si un lote cierra sin ofertas, aparece acá.</Empty>
        ) : (
          <div className="divide-y divide-line border-t border-line">
            {desiertoLotes.map((lote) => (
              <DesiertoLoteCard key={lote.id} remateId={remateId} lote={lote} currency={currency} canUseCustomPrice variant="row" />
            ))}
          </div>
        )}
      </CollapsibleSection>

      <CollapsibleSection
        title="Próximos"
        count={upcomingLotes.length}
        defaultOpen
        hint="Los lotes que todavía no se abrieron, en el orden en que va a ir abriéndolos el martillero."
      >
        {upcomingLotes.length === 0 ? (
          <Empty>No quedan lotes por abrir.</Empty>
        ) : (
          <ol className="border-t border-line">
            {upcomingLotes.map((lote, index) => (
              <UpcomingRow key={lote.id} lote={lote} position={index + 1} currency={currency} />
            ))}
          </ol>
        )}
      </CollapsibleSection>

      <CollapsibleSection
        title="Adjudicados"
        count={sold.length}
        defaultOpen
        aside={sold.length > 0 ? <>Vendidos por <b className="font-semibold text-ink">{formatCurrency(String(soldTotal), currency)}</b></> : undefined}
        hint="Lotes vendidos. La barra muestra cuánto subió cada uno sobre su precio base; tocá uno para ver todas sus ofertas."
      >
        {sold.length === 0 ? (
          <Empty>{isLoading ? 'Cargando lotes…' : 'Todavía no se adjudicó ningún lote.'}</Empty>
        ) : (
          <ul className="border-t border-line [&:hover>li:not(:hover)]:opacity-60">
            {sold.map((lote) => (
              <LoteHistoryRow
                key={lote.id}
                lote={lote}
                currency={currency}
                offerDetail={offerResults.get(lote.id)}
                postAuctionCase={undefined}
                maxRise={maxRise}
                onOpen={() => setOpenLote(lote)}
              />
            ))}
          </ul>
        )}
      </CollapsibleSection>

      {openLote && (
        <LoteHistoryDrawer remateId={remateId} lote={openLote} currency={currency} postAuctionCase={undefined} onClose={() => setOpenLote(null)} />
      )}
    </div>
  );
}
