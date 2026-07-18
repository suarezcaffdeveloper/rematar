import { memo } from 'react';
import { CoverPlaceholder } from '../../remates/components/CoverPlaceholder';
import { BoxIcon } from '../../remates/components/icons';
import { CATEGORY_LABELS } from '../../remates/labels';
import type { Lote } from '../../remates/types';

const UpcomingLoteCard = memo(function UpcomingLoteCard({ lote }: { lote: Lote }) {
  const mainImage = [...lote.images].sort((a, b) => a.order - b.order)[0];

  return (
    <div className="flex w-48 shrink-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="aspect-video w-full overflow-hidden">
        {mainImage ? (
          <img src={mainImage.url} alt="" className="h-full w-full object-cover" />
        ) : (
          <CoverPlaceholder className="h-full w-full" icon={<BoxIcon className="h-6 w-6 text-brand-300" />} />
        )}
      </div>
      <div className="flex flex-col gap-0.5 p-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Lote {lote.lot_number}</span>
        <p className="truncate text-sm font-medium text-slate-800">{lote.title}</p>
        <span className="text-xs text-slate-400">{CATEGORY_LABELS[lote.category]}</span>
      </div>
    </div>
  );
});

export interface UpcomingLotesStripProps {
  lotes: Lote[];
}

/**
 * Tira horizontal de los lotes que siguen -- informativa, deliberadamente NO
 * seleccionable (pedido explícito del módulo): son `<div>`, no `<button>` ni `<Link>`,
 * así que no hay ningún control interactivo que sugiera que se puede navegar a un lote
 * futuro desde acá.
 */
export function UpcomingLotesStrip({ lotes }: UpcomingLotesStripProps) {
  if (lotes.length === 0) {
    return <p className="text-sm text-slate-500">No hay más lotes cargados en este remate.</p>;
  }

  return (
    <div role="list" aria-label="Próximos lotes" className="flex gap-4 overflow-x-auto pb-2">
      {lotes.map((lote) => (
        <div role="listitem" key={lote.id}>
          <UpcomingLoteCard lote={lote} />
        </div>
      ))}
    </div>
  );
}
