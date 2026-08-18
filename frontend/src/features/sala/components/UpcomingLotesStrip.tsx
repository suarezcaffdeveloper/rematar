import { memo } from 'react';
import { CoverPlaceholder } from '../../remates/components/CoverPlaceholder';
import { BoxIcon } from '../../remates/components/icons';
import { CATEGORY_LABELS } from '../../remates/labels';
import type { Lote } from '../../remates/types';

/** Sin card envolvente (rediseño visual -- pedido explícito de no encerrar cada bloque
 * en un rectángulo): la imagen conserva un borde fino propio (es contenido, no chrome),
 * el texto va directo debajo, separado solo por espacio. */
const UpcomingLoteCard = memo(function UpcomingLoteCard({ lote }: { lote: Lote }) {
  const mainImage = [...lote.images].sort((a, b) => a.order - b.order)[0];

  return (
    <div className="flex w-44 shrink-0 flex-col gap-2">
      <div className="aspect-video w-full overflow-hidden rounded-lg border border-line">
        {mainImage ? (
          <img src={mainImage.url} alt="" className="h-full w-full object-cover" />
        ) : (
          <CoverPlaceholder className="h-full w-full" icon={<BoxIcon className="h-6 w-6 text-brand-300" />} />
        )}
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Lote {lote.lot_number}</span>
        <p className="truncate text-sm font-medium text-ink">{lote.title}</p>
        <span className="text-xs text-ink-faint">{CATEGORY_LABELS[lote.category]}</span>
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
    return <p className="text-sm text-ink-faint">No hay más lotes cargados en este remate.</p>;
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
