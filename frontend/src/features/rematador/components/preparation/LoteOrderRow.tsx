import type { DragEvent } from 'react';
import clsx from 'clsx';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { formatCurrency } from '../../../../shared/lib/format';
import { CoverPlaceholder } from '../../../remates/components/CoverPlaceholder';
import { BoxIcon } from '../../../remates/components/icons';
import { CATEGORY_LABELS } from '../../../remates/labels';
import type { Lote } from '../../../remates/types';

export interface LoteOrderRowProps {
  lote: Lote;
  currency: string;
  position: number;
  total: number;
  isEditable: boolean;
  isNew: boolean;
  onOpen: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDragStart: (event: DragEvent<HTMLElement>) => void;
  onDragEnter: (event: DragEvent<HTMLElement>) => void;
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
  isDragOver: boolean;
  isDragging: boolean;
}

/**
 * Vista "Orden de salida": una fila por lote con su posición en grande -- para revisar y
 * ajustar el orden de un vistazo. Las flechas son el reordenamiento siempre disponible
 * (táctil, teclado, lectores de pantalla); arrastrar la fila también funciona con mouse.
 */
export function LoteOrderRow({
  lote,
  currency,
  position,
  total,
  isEditable,
  isNew,
  onOpen,
  onMoveUp,
  onMoveDown,
  onDragStart,
  onDragEnter,
  onDragOver,
  onDrop,
  onDragEnd,
  isDragOver,
  isDragging,
}: LoteOrderRowProps) {
  const mainImage = [...lote.images].sort((a, b) => a.order - b.order)[0];
  return (
    <li
      data-lote-id={lote.id}
      draggable={isEditable}
      onDragStart={onDragStart}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className={clsx(
        'grid grid-cols-[2.5rem_3.75rem_minmax(0,1fr)_auto] items-center gap-3.5 border-b border-line py-3 transition-opacity duration-300 sm:grid-cols-[2.75rem_3.75rem_minmax(0,1fr)_auto_auto]',
        isDragOver && 'bg-brand-50',
        isDragging && 'opacity-40',
        isNew && 'motion-safe:animate-lote-pop',
      )}
    >
      <span className="text-2xl font-semibold tabular-nums tracking-tight text-ink-faint">{position}</span>
      <button
        type="button"
        onClick={onOpen}
        aria-label={`${isEditable ? 'Editar' : 'Ver'} lote ${lote.lot_number}: ${lote.title}`}
        className="h-11 w-[3.75rem] overflow-hidden rounded-[10px] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
      >
        {mainImage ? (
          <img src={mainImage.url} alt="" className="h-full w-full object-cover" />
        ) : (
          <CoverPlaceholder className="h-full w-full" icon={<BoxIcon className="h-5 w-5 text-brand-300" />} />
        )}
      </button>
      <div className="min-w-0">
        <p className="truncate font-semibold tracking-tight">
          Lote {lote.lot_number} · {lote.title}
        </p>
        <p className="text-sm text-ink-muted">
          {CATEGORY_LABELS[lote.category]}
          {lote.images.length === 0 && <b className="font-semibold text-warning-700"> · Sin foto</b>}
          {lote.reserve_price ? ' · con reserva' : ''}
        </p>
      </div>
      <p className="hidden text-right tabular-nums sm:block">
        <b>{formatCurrency(lote.base_price, currency)}</b>
        <br />
        <span className="text-sm text-ink-muted">+ {formatCurrency(lote.min_increment, currency)}</span>
      </p>
      {isEditable ? (
        <span className="flex gap-0.5">
          <button
            type="button"
            aria-label={`Mover lote ${lote.lot_number} hacia arriba`}
            onClick={onMoveUp}
            disabled={position <= 1}
            className="flex h-9 w-9 items-center justify-center rounded-full text-ink-muted hover:bg-surface-subtle hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ChevronUp aria-hidden="true" className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label={`Mover lote ${lote.lot_number} hacia abajo`}
            onClick={onMoveDown}
            disabled={position >= total}
            className="flex h-9 w-9 items-center justify-center rounded-full text-ink-muted hover:bg-surface-subtle hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ChevronDown aria-hidden="true" className="h-4 w-4" />
          </button>
        </span>
      ) : (
        <span />
      )}
    </li>
  );
}
