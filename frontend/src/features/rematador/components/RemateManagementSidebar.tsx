import { Settings } from 'lucide-react';
import { Badge } from '../../../shared/components/Badge';
import { DropdownMenu } from '../../../shared/components/DropdownMenu';
import { formatDateTime } from '../../../shared/lib/format';
import { CoverPlaceholder } from '../../remates/components/CoverPlaceholder';
import { CalendarIcon } from '../../remates/components/icons';
import { CATEGORY_LABELS, STATUS_BADGE_VARIANTS, STATUS_LABELS } from '../../remates/labels';
import type { Remate } from '../../remates/types';

export interface RemateManagementSidebarProps {
  remate: Remate;
  onEdit: () => void;
  onCancel: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onViewAudit: () => void;
  isDuplicating: boolean;
}

/**
 * Card de resumen del remate en la Gestión de Remates y Lotes (Épica 5, Módulo 5.3;
 * rediseñada a "centro de preparación del remate"): solo lo esencial para reconocer el
 * remate de un vistazo (portada, nombre, estado, categoría, fecha de inicio). El resto
 * de las acciones de ciclo de vida (editar/duplicar/auditoría/cancelar/eliminar) viven
 * agrupadas bajo "Configuración del remate" para no competir visualmente con "Agregar
 * lote" / "Publicar remate", que son las dos acciones que de verdad importan en esta
 * pantalla. "Publicar remate" no vive acá: `LotesManagementPage` la muestra como acción
 * flotante propia, separada de esta configuración secundaria.
 */
export function RemateManagementSidebar({
  remate,
  onEdit,
  onCancel,
  onDelete,
  onDuplicate,
  onViewAudit,
  isDuplicating,
}: RemateManagementSidebarProps) {
  const isDraft = remate.status === 'draft';
  const isEditable = remate.status === 'draft' || remate.status === 'scheduled';
  const isCancellable =
    remate.status === 'draft' || remate.status === 'scheduled' || remate.status === 'live' || remate.status === 'paused';

  return (
    <aside className="flex w-full flex-col gap-4 lg:w-72 lg:shrink-0">
      <div className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-all duration-300 hover:border-slate-300 hover:shadow-md">
        <div className="aspect-video w-full overflow-hidden">
          {remate.cover_image_url ? (
            <img
              src={remate.cover_image_url}
              alt=""
              className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
            />
          ) : (
            <CoverPlaceholder className="h-full w-full" />
          )}
        </div>
        <div className="flex flex-col gap-2.5 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={STATUS_BADGE_VARIANTS[remate.status]}>{STATUS_LABELS[remate.status]}</Badge>
            <span className="text-xs font-semibold uppercase tracking-wide text-brand-600">
              {CATEGORY_LABELS[remate.category]}
            </span>
          </div>
          <h1 className="text-lg font-bold leading-snug text-slate-900">{remate.title}</h1>
          {remate.starts_at && (
            <div className="flex items-center gap-1.5 text-sm text-slate-500">
              <CalendarIcon className="h-4 w-4 shrink-0 text-slate-400" />
              <span>{formatDateTime(remate.starts_at)}</span>
            </div>
          )}
        </div>
      </div>

      <DropdownMenu
        triggerLabel="Configuración del remate"
        trigger={
          <span className="inline-flex items-center gap-2 px-1.5 text-sm font-medium text-slate-600">
            <Settings aria-hidden="true" className="h-4 w-4" />
            Configuración del remate
          </span>
        }
        items={[
          {
            label: 'Editar remate',
            onSelect: onEdit,
            disabled: !isEditable,
          },
          {
            label: isDuplicating ? 'Duplicando…' : 'Duplicar remate',
            onSelect: onDuplicate,
            disabled: isDuplicating,
          },
          { label: 'Ver auditoría', onSelect: onViewAudit },
          ...(isCancellable ? [{ label: 'Cancelar remate', onSelect: onCancel }] : []),
          ...(isDraft
            ? [{ label: 'Eliminar remate', onSelect: onDelete, variant: 'danger' as const }]
            : []),
        ]}
      />
    </aside>
  );
}
