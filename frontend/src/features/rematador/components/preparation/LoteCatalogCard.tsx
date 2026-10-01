import type { DragEvent } from 'react';
import clsx from 'clsx';
import { ImageIcon, Lock, RefreshCw } from 'lucide-react';
import { DropdownMenu } from '../../../../shared/components/DropdownMenu';
import { formatCurrency } from '../../../../shared/lib/format';
import { CoverPlaceholder } from '../../../remates/components/CoverPlaceholder';
import { BoxIcon } from '../../../remates/components/icons';
import { CATEGORY_LABELS } from '../../../remates/labels';
import type { Lote } from '../../../remates/types';

export interface LoteCatalogCardProps {
  lote: Lote;
  currency: string;
  /** Posición (empezando en 1) y total, en el orden de salida completo -- no el de la lista filtrada. */
  position: number;
  total: number;
  /** `true` solo si el remate padre está `draft`/`scheduled` (mismo criterio que el backend,
   * `LoteService._assert_structure_editable`). Si no, la tarjeta es de solo lectura: sin
   * drag, sin menú de acciones, y el botón principal dice "Ver" en vez de "Editar". */
  isEditable: boolean;
  /** Recién creado/duplicado: hace una entrada con escala para que se note dónde quedó. */
  isNew: boolean;
  onOpen: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onMoveBefore: () => void;
  onMoveAfter: () => void;
  onDragStart: (event: DragEvent<HTMLElement>) => void;
  onDragEnter: (event: DragEvent<HTMLElement>) => void;
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
  isDragOver: boolean;
  isDragging: boolean;
}

/**
 * Lote en la galería de preparación: foto grande con el número encima, nombre, rubro, precio
 * base e incremento, etiquetas (reserva, reencolado) y su posición en el orden de salida.
 * El drag & drop es HTML5 nativo (ADR-034) y no funciona en táctil: "Mover antes/después"
 * del menú es el mecanismo de reordenamiento siempre disponible (mobile, teclado, lectores
 * de pantalla).
 */
export function LoteCatalogCard({
  lote,
  currency,
  position,
  total,
  isEditable,
  isNew,
  onOpen,
  onDuplicate,
  onDelete,
  onMoveBefore,
  onMoveAfter,
  onDragStart,
  onDragEnter,
  onDragOver,
  onDrop,
  onDragEnd,
  isDragOver,
  isDragging,
}: LoteCatalogCardProps) {
  const mainImage = [...lote.images].sort((a, b) => a.order - b.order)[0];
  const hasReserve = Boolean(lote.reserve_price);

  return (
    <article
      data-lote-id={lote.id}
      draggable={isEditable}
      onDragStart={onDragStart}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className={clsx(
        'group relative flex min-w-0 flex-col rounded-2xl transition-[opacity,box-shadow] duration-200',
        isDragOver && 'ring-2 ring-brand-500 ring-offset-8',
        isDragging && 'opacity-40',
        isNew && 'motion-safe:animate-lote-pop',
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        aria-label={`${isEditable ? 'Editar' : 'Ver'} lote ${lote.lot_number}: ${lote.title}`}
        className="relative block aspect-[4/3] w-full overflow-hidden rounded-2xl bg-surface-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
      >
        {mainImage ? (
          <img
            src={mainImage.url}
            alt=""
            className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
          />
        ) : (
          <CoverPlaceholder className="h-full w-full" icon={<BoxIcon className="h-8 w-8 text-brand-300" />} />
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink/50 via-transparent to-transparent" />
        <span className="absolute left-3 top-3 rounded-full bg-white px-3 py-1 text-xs font-bold shadow-sm">Lote {lote.lot_number}</span>
        {lote.images.length > 0 ? (
          <span className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-ink/55 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur-md">
            <ImageIcon aria-hidden="true" className="h-3 w-3" />
            {lote.images.length}
          </span>
        ) : (
          <span className="absolute right-3 top-3 rounded-full bg-warning-50 px-2.5 py-1 text-xs font-semibold text-warning-700">Sin foto</span>
        )}
      </button>

      <div className="flex-1 pt-3.5">
        <h3 className="line-clamp-2 text-lg font-semibold leading-tight tracking-tight">{lote.title}</h3>
        <p className="mt-1 text-sm text-ink-muted">{CATEGORY_LABELS[lote.category]}</p>
        <p className="mt-2.5 text-2xl font-semibold tabular-nums tracking-tight">
          {formatCurrency(lote.base_price, currency)}
          <span className="ml-2 text-sm font-medium tracking-normal text-ink-muted">+ {formatCurrency(lote.min_increment, currency)} por oferta</span>
        </p>
        {(hasReserve || lote.requeue_preset_enabled) && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {hasReserve && (
              <span
                className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-subtle px-2 py-0.5 text-xs font-semibold text-ink-muted"
                title="Solo lo ves vos"
              >
                <Lock aria-hidden="true" className="h-3 w-3" />
                Reserva {formatCurrency(lote.reserve_price as string, currency)}
              </span>
            )}
            {lote.requeue_preset_enabled && (
              <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700">
                <RefreshCw aria-hidden="true" className="h-3 w-3" />
                Reencola
              </span>
            )}
          </div>
        )}
        <p className="mt-2.5 text-xs text-ink-faint">
          Sale en la posición {position} de {total}
        </p>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={onOpen}
          className={clsx(
            'inline-flex h-10 flex-1 items-center justify-center rounded-full px-4 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2',
            isEditable ? 'bg-brand-50 text-brand-700 hover:bg-brand-100' : 'border border-line-strong bg-white text-ink hover:border-ink',
          )}
        >
          {isEditable ? 'Editar' : 'Ver'}
        </button>
        {isEditable && (
          <div className="shrink-0 rounded-full border border-line-strong">
            <DropdownMenu
              triggerLabel={`Más acciones para el lote ${lote.lot_number}`}
              items={[
                { label: 'Mover antes', onSelect: onMoveBefore, disabled: position <= 1 },
                { label: 'Mover después', onSelect: onMoveAfter, disabled: position >= total },
                { label: 'Duplicar', onSelect: onDuplicate },
                { label: 'Eliminar', onSelect: onDelete, variant: 'danger' },
              ]}
            />
          </div>
        )}
      </div>
    </article>
  );
}
