import { Settings } from 'lucide-react';
import { DropdownMenu } from '../../../shared/components/DropdownMenu';
import type { Remate } from '../../remates/types';

export interface RemateSettingsMenuProps {
  remate: Remate;
  onEdit: () => void;
  onCancel: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onViewAudit: () => void;
  isDuplicating: boolean;
}

/**
 * Menú "Configuración del remate" de la pantalla de preparación -- las acciones de ciclo de
 * vida del remate (editar, duplicar, auditoría, cancelar, eliminar), agrupadas para que no
 * compitan con "Agregar lote" y "Publicar remate". Reemplaza a `RemateManagementSidebar`,
 * del que conserva exactamente las mismas reglas: editar solo en borrador/programado,
 * cancelar mientras no haya terminado y eliminar solo un borrador.
 */
export function RemateSettingsMenu({ remate, onEdit, onCancel, onDelete, onDuplicate, onViewAudit, isDuplicating }: RemateSettingsMenuProps) {
  const isDraft = remate.status === 'draft';
  const isEditable = remate.status === 'draft' || remate.status === 'scheduled';
  const isCancellable =
    remate.status === 'draft' || remate.status === 'scheduled' || remate.status === 'live' || remate.status === 'paused';

  return (
    <DropdownMenu
      triggerLabel="Configuración del remate"
      trigger={
        <span className="inline-flex items-center gap-2 px-2 text-sm font-semibold text-ink-muted">
          <Settings aria-hidden="true" className="h-4 w-4" />
          Configuración del remate
        </span>
      }
      items={[
        { label: 'Editar remate', onSelect: onEdit, disabled: !isEditable },
        { label: isDuplicating ? 'Duplicando…' : 'Duplicar remate', onSelect: onDuplicate, disabled: isDuplicating },
        { label: 'Ver auditoría', onSelect: onViewAudit },
        ...(isCancellable ? [{ label: 'Cancelar remate', onSelect: onCancel }] : []),
        ...(isDraft ? [{ label: 'Eliminar remate', onSelect: onDelete, variant: 'danger' as const }] : []),
      ]}
    />
  );
}
