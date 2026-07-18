import { memo } from 'react';
import clsx from 'clsx';
import { CoverPlaceholder } from '../../remates/components/CoverPlaceholder';
import { BoxIcon } from '../../remates/components/icons';
import { CATEGORY_LABELS } from '../../remates/labels';
import type { Lote } from '../../remates/types';

interface UpcomingLoteCardProps {
  lote: Lote;
  isSelected: boolean;
  selectionEnabled: boolean;
  onSelect: (loteId: string) => void;
}

/** `memo`: evita re-renderizar las tarjetas que no cambiaron cuando llega un evento en
 * vivo que solo afecta a otro lote (mismo criterio que `UpcomingLoteCard` en
 * `features/sala/components/UpcomingLotesStrip.tsx`, reimplementado acá en vez de
 * importado porque acá SÍ necesita ser seleccionable -- justo lo que ese componente
 * evita a propósito para el comprador). */
const UpcomingLoteCard = memo(function UpcomingLoteCard({
  lote,
  isSelected,
  selectionEnabled,
  onSelect,
}: UpcomingLoteCardProps) {
  const mainImage = [...lote.images].sort((a, b) => a.order - b.order)[0];

  const content = (
    <>
      <div className="aspect-video w-full overflow-hidden">
        {mainImage ? (
          <img src={mainImage.url} alt="" className="h-full w-full object-cover" />
        ) : (
          <CoverPlaceholder className="h-full w-full" icon={<BoxIcon className="h-6 w-6 text-brand-300" />} />
        )}
      </div>
      <div className="flex flex-col gap-0.5 p-3 text-left">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Lote {lote.lot_number}</span>
        <p className="truncate text-sm font-medium text-slate-800">{lote.title}</p>
        <span className="text-xs text-slate-400">{CATEGORY_LABELS[lote.category]}</span>
      </div>
    </>
  );

  const cardClassName = clsx(
    'flex w-48 shrink-0 flex-col overflow-hidden rounded-lg border-2 bg-white shadow-sm transition-colors',
    isSelected ? 'border-brand-600 ring-2 ring-brand-200' : 'border-slate-200',
  );

  // No seleccionable: mismo criterio que la tira de "próximos lotes" del comprador
  // (`UpcomingLotesStrip`, Épica 4.5) -- un `<div>`, no un `<button>`, para que no
  // sugiera ninguna interacción que el estado actual del remate no permite (pedido
  // explícito de este módulo: "permitir seleccionar únicamente cuando el estado del
  // remate lo permita").
  if (!selectionEnabled) {
    return (
      <div role="listitem" className={cardClassName}>
        {content}
      </div>
    );
  }

  return (
    <div role="listitem">
      <button
        type="button"
        onClick={() => onSelect(lote.id)}
        aria-pressed={isSelected}
        className={clsx(cardClassName, !isSelected && 'hover:border-brand-300', 'focus-visible:outline-none')}
      >
        {content}
      </button>
    </div>
  );
});

export interface ConsolaUpcomingLotesPanelProps {
  /** Ya filtrados a `status === 'pending'` (viene de `upcomingLotes`, `useLiveRemateState`). */
  lotes: Lote[];
  selectedLoteId: string | null;
  onSelect: (loteId: string) => void;
  /** `true` solo cuando el remate está `live` y no hay ningún lote `open` -- las mismas
   * condiciones que ya exige el backend para `open`/`open_next` (`docs/16-motor-de-
   * estados.md`), validadas acá antes de dejar interactuar en vez de esperar un 422. */
  selectionEnabled: boolean;
}

/**
 * Panel de próximos lotes de la Consola Operativa (Épica 5, Módulo 5.2): igual que la
 * tira de "próximos lotes" del comprador en estructura visual, pero con una diferencia
 * de propósito explícita en el enunciado -- acá el rematador puede seleccionar cuál abrir
 * a continuación (`ConsolaControlPanel` usa `selectedLoteId` para "Abrir lote"), no solo
 * mirarlos.
 */
export function ConsolaUpcomingLotesPanel({
  lotes,
  selectedLoteId,
  onSelect,
  selectionEnabled,
}: ConsolaUpcomingLotesPanelProps) {
  if (lotes.length === 0) {
    return <p className="text-sm text-slate-500">No hay más lotes cargados en este remate.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {!selectionEnabled && (
        <p className="text-xs text-slate-400">
          La selección se habilita cuando el remate está en vivo y no hay un lote abierto.
        </p>
      )}
      <div role="list" aria-label="Próximos lotes" className="flex gap-4 overflow-x-auto pb-2">
        {lotes.map((lote) => (
          <UpcomingLoteCard
            key={lote.id}
            lote={lote}
            isSelected={lote.id === selectedLoteId}
            selectionEnabled={selectionEnabled}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}
