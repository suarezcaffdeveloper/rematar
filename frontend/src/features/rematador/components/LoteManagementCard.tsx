import type { DragEvent } from 'react';
import clsx from 'clsx';
import { motion, useReducedMotion } from 'framer-motion';
import { ImageIcon } from 'lucide-react';
import { Badge } from '../../../shared/components/Badge';
import { DropdownMenu } from '../../../shared/components/DropdownMenu';
import { formatCurrency } from '../../../shared/lib/format';
import { CoverPlaceholder } from '../../remates/components/CoverPlaceholder';
import { BoxIcon } from '../../remates/components/icons';
import { CATEGORY_LABELS, LOTE_STATUS_BADGE_VARIANTS, LOTE_STATUS_LABELS } from '../../remates/labels';
import type { Lote } from '../../remates/types';
import { ChevronUpIcon, GripVerticalIcon } from './icons';
import { ChevronDownIcon } from '../../audit/components/icons';

export interface LoteManagementCardProps {
  lote: Lote;
  currency: string;
  /** `true` solo si el remate padre está `draft`/`scheduled` -- mismo criterio que el
   * backend usa para permitir editar/reordenar (`LoteService._assert_structure_editable`,
   * `docs/15-modulo-lote.md`). En cualquier otro estado, la tarjeta es de solo lectura:
   * sin drag, sin botones de mover, sin menú de acciones. */
  isEditable: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
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
 * Tarjeta de un lote en la Gestión de Remates y Lotes (Épica 5, Módulo 5.3). El drag &
 * drop (HTML5 nativo, sin librería -- ver ADR-034) no funciona en pantallas táctiles;
 * las flechas ↑/↓ son el mecanismo de reordenamiento siempre disponible (mobile,
 * teclado, lectores de pantalla), no un agregado cosmético.
 */
export function LoteManagementCard({
  lote,
  currency,
  isEditable,
  canMoveUp,
  canMoveDown,
  onEdit,
  onDuplicate,
  onDelete,
  onMoveUp,
  onMoveDown,
  onDragStart,
  onDragEnter,
  onDragOver,
  onDrop,
  onDragEnd,
  isDragOver,
  isDragging,
}: LoteManagementCardProps) {
  const prefersReducedMotion = useReducedMotion();
  const mainImage = [...lote.images].sort((a, b) => a.order - b.order)[0];

  return (
    // `motion.div` solo para la animación de entrada/hover -- los props nativos de
    // drag & drop (onDragStart/onDragEnd/etc.) van en el <article> plano de adentro:
    // framer-motion intercepta esos mismos nombres de prop para sus propios gestos de
    // drag (firma `(event, info: PanInfo) => void`), incompatible con los `DragEvent`
    // nativos de HTML5 que usa este componente (ADR-034, sin librería de D&D).
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.21, 0.47, 0.32, 0.98] }}
      whileHover={prefersReducedMotion ? undefined : { y: -2 }}
    >
      <article
        draggable={isEditable}
        onDragStart={onDragStart}
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onDragEnd={onDragEnd}
        className={clsx(
          'flex items-center gap-4 rounded-2xl border bg-white p-4 shadow-sm transition-shadow duration-200',
          'hover:shadow-lg',
          isDragOver ? 'border-brand-500 ring-2 ring-brand-200' : 'border-line',
          isDragging && 'opacity-40',
        )}
      >
      {isEditable && (
        <div className="flex flex-col items-center gap-1 text-ink-faint">
          <button
            type="button"
            aria-label={`Mover lote ${lote.lot_number} hacia arriba`}
            onClick={onMoveUp}
            disabled={!canMoveUp}
            className="rounded p-0.5 hover:bg-surface-subtle hover:text-ink-muted disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ChevronUpIcon className="h-4 w-4" />
          </button>
          <GripVerticalIcon className="h-5 w-5 cursor-grab active:cursor-grabbing" aria-hidden="true" />
          <button
            type="button"
            aria-label={`Mover lote ${lote.lot_number} hacia abajo`}
            onClick={onMoveDown}
            disabled={!canMoveDown}
            className="rounded p-0.5 hover:bg-surface-subtle hover:text-ink-muted disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ChevronDownIcon className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="relative h-20 w-28 shrink-0 overflow-hidden rounded-xl">
        {mainImage ? (
          <img src={mainImage.url} alt="" className="h-full w-full object-cover" />
        ) : (
          <CoverPlaceholder className="h-full w-full" icon={<BoxIcon className="h-6 w-6 text-brand-300" />} />
        )}
        {lote.images.length > 0 && (
          <span className="absolute bottom-1 right-1 inline-flex items-center gap-1 rounded-full bg-ink/70 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
            <ImageIcon aria-hidden="true" className="h-3 w-3" />
            {lote.images.length}
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
            Lote {lote.lot_number}
          </span>
          <Badge variant={LOTE_STATUS_BADGE_VARIANTS[lote.status]}>{LOTE_STATUS_LABELS[lote.status]}</Badge>
        </div>
        <p className="truncate text-sm font-semibold text-ink">{lote.title}</p>
        <p className="text-xs text-ink-faint">
          {CATEGORY_LABELS[lote.category]} · {formatCurrency(lote.base_price, currency)}
        </p>
      </div>

        <DropdownMenu
          triggerLabel={`Más acciones para el lote ${lote.lot_number}`}
          items={[
            { label: 'Editar', onSelect: onEdit, disabled: !isEditable },
            { label: 'Duplicar', onSelect: onDuplicate, disabled: !isEditable },
            { label: 'Eliminar', onSelect: onDelete, disabled: !isEditable, variant: 'danger' },
          ]}
        />
      </article>
    </motion.div>
  );
}
