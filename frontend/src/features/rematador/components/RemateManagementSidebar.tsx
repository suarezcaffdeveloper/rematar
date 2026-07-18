import { Badge } from '../../../shared/components/Badge';
import { Button } from '../../../shared/components/Button';
import { formatDateTime } from '../../../shared/lib/format';
import { CoverPlaceholder } from '../../remates/components/CoverPlaceholder';
import { CalendarIcon, PinIcon } from '../../remates/components/icons';
import { CATEGORY_LABELS, STATUS_BADGE_VARIANTS, STATUS_LABELS } from '../../remates/labels';
import type { Remate } from '../../remates/types';
import { CopyIcon, PencilIcon, SendIcon, TrashIcon } from './icons';

export interface RemateManagementSidebarProps {
  remate: Remate;
  loteCount: number;
  onEdit: () => void;
  onPublish: () => void;
  onCancel: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  isPublishing: boolean;
  isDuplicating: boolean;
}

/**
 * Sidebar de la Gestión de Remates y Lotes (Épica 5, Módulo 5.3) -- resumen del remate +
 * sus acciones de ciclo de vida estructural (editar, publicar, cancelar, eliminar,
 * duplicar). Distinto del panel de control de la Consola Operativa (Épica 5.2): ese
 * opera un remate YA en vivo (pausar/reanudar/abrir lote); este prepara uno que
 * todavía no arrancó.
 */
export function RemateManagementSidebar({
  remate,
  loteCount,
  onEdit,
  onPublish,
  onCancel,
  onDelete,
  onDuplicate,
  isPublishing,
  isDuplicating,
}: RemateManagementSidebarProps) {
  const isDraft = remate.status === 'draft';
  const isEditable = remate.status === 'draft' || remate.status === 'scheduled';
  const isCancellable = remate.status === 'draft' || remate.status === 'scheduled' || remate.status === 'live' || remate.status === 'paused';
  const canPublish = isDraft && Boolean(remate.starts_at);

  return (
    <aside className="flex w-full flex-col gap-4 lg:w-72 lg:shrink-0">
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="aspect-video w-full">
          {remate.cover_image_url ? (
            <img src={remate.cover_image_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <CoverPlaceholder className="h-full w-full" />
          )}
        </div>
        <div className="flex flex-col gap-2 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={STATUS_BADGE_VARIANTS[remate.status]}>{STATUS_LABELS[remate.status]}</Badge>
          </div>
          <h1 className="text-lg font-bold text-slate-900">{remate.title}</h1>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">
            {CATEGORY_LABELS[remate.category]}
          </p>

          <dl className="mt-1 flex flex-col gap-1.5 text-sm text-slate-600">
            {remate.starts_at && (
              <div className="flex items-center gap-2">
                <CalendarIcon className="h-4 w-4 shrink-0 text-slate-400" />
                <span>{formatDateTime(remate.starts_at)}</span>
              </div>
            )}
            {remate.location && (
              <div className="flex items-center gap-2">
                <PinIcon className="h-4 w-4 shrink-0 text-slate-400" />
                <span className="truncate">{remate.location}</span>
              </div>
            )}
            <div>
              {loteCount} {loteCount === 1 ? 'lote cargado' : 'lotes cargados'}
            </div>
          </dl>
        </div>
      </div>

      <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Acciones</h2>

        <Button
          variant="secondary"
          onClick={onEdit}
          disabled={!isEditable}
          title={!isEditable ? 'Solo se puede editar un remate en borrador o programado.' : undefined}
        >
          <PencilIcon className="h-4 w-4" />
          Editar remate
        </Button>

        {isDraft && (
          <Button
            onClick={onPublish}
            isLoading={isPublishing}
            disabled={!canPublish}
            title={!canPublish ? 'Definí una fecha de inicio (Editar remate) antes de publicar.' : undefined}
          >
            <SendIcon className="h-4 w-4" />
            Publicar remate
          </Button>
        )}

        <Button variant="secondary" onClick={onDuplicate} isLoading={isDuplicating}>
          <CopyIcon className="h-4 w-4" />
          Duplicar remate
        </Button>

        {isCancellable && (
          <Button variant="secondary" onClick={onCancel}>
            Cancelar remate
          </Button>
        )}

        {isDraft && (
          <Button variant="danger" onClick={onDelete}>
            <TrashIcon className="h-4 w-4" />
            Eliminar remate
          </Button>
        )}
      </div>
    </aside>
  );
}
