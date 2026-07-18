import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '../../../shared/components/Badge';
import { Button } from '../../../shared/components/Button';
import { ConfirmModal } from '../../../shared/components/ConfirmModal';
import { DropdownMenu } from '../../../shared/components/DropdownMenu';
import { normalizeApiError } from '../../../shared/api/errors';
import { formatDateTime } from '../../../shared/lib/format';
import { useToastStore } from '../../../shared/toast/toastStore';
import {
  deleteRemateRequest,
  finishRemateRequest,
  resumeRemateRequest,
  scheduleRemateRequest,
  startRemateRequest,
} from '../../remates/api';
import { BoxIcon, CalendarIcon, UsersIcon } from '../../remates/components/icons';
import { CATEGORY_LABELS, STATUS_BADGE_VARIANTS, STATUS_LABELS } from '../../remates/labels';
import type { Remate } from '../../remates/types';
import { CancelRemateModal } from './CancelRemateModal';
import { RemateFormModal } from './RemateFormModal';
import { duplicateRemate } from '../duplication';
import { useRemateOperationalInfo } from '../hooks';

export interface RematadorRemateCardProps {
  remate: Remate;
  /** Se llama después de que una acción de ciclo de vida termina con éxito, para que el
   * dashboard recargue la lista y refleje el nuevo estado -- esta tarjeta no sabe nada
   * de la lista que la contiene, solo avisa "algo cambió" (mismo criterio que
   * `reload()` en el resto de los hooks del proyecto). */
  onChanged: () => void;
}

type LifecycleAction = 'start' | 'resume' | 'finish';

const ACTION_LABELS: Record<LifecycleAction, string> = {
  start: 'Iniciar remate',
  resume: 'Reanudar remate',
  finish: 'Finalizar remate',
};

const SUCCESS_MESSAGES: Record<LifecycleAction, string> = {
  start: 'El remate está en vivo.',
  resume: 'El remate se reanudó.',
  finish: 'El remate se finalizó.',
};

const ACTION_REQUESTS: Record<LifecycleAction, (remateId: string) => Promise<Remate>> = {
  start: startRemateRequest,
  resume: resumeRemateRequest,
  finish: finishRemateRequest,
};

function describeLoteState(
  loteCount: number | null,
  activeLote: { title: string } | null,
  nextLote: { title: string } | null,
): string {
  if (loteCount === null) return 'Cargando lotes…';
  if (loteCount === 0) return 'Todavía no hay lotes cargados.';
  if (activeLote) return `Lote activo: ${activeLote.title}`;
  if (nextLote) return `Próximo lote: ${nextLote.title}`;
  return 'No quedan lotes pendientes.';
}

/**
 * Tarjeta de un remate propio en el Dashboard del Rematador (Épica 5, Módulo 5.1).
 * Distinta de `RemateCard` (Épica 4.3, de solo lectura para un comprador): esta muestra
 * datos operativos (lote activo/próximo, conectados) y acciones de ciclo de vida
 * condicionadas al `status` actual -- "Iniciar" (`scheduled`, exige al menos un lote),
 * "Reanudar" (`paused`) y "Finalizar" (`live`, exige que no haya un lote `open`). No
 * incluye "Pausar": es una acción de control en vivo que corresponde a la Consola
 * Operativa del Rematador (Módulo 5.2, ver docs/29-dashboard-rematador.md), no a este
 * dashboard de repaso -- "Reanudar" sigue teniendo sentido acá para retomar un remate que
 * quedó pausado de una sesión anterior.
 *
 * Épica 5, Módulo 5.3 agrega el menú "⋯" (editar/publicar/duplicar/cancelar/eliminar,
 * ver `docs/31-gestion-remates-lotes.md`) y hace que "Administrar"/"Preparar lotes"
 * navegue a una ruta distinta según el estado: mientras el remate todavía no arrancó
 * (`draft`/`scheduled`), a la Gestión de Lotes (`/lotes`, este módulo); una vez en curso
 * o terminado, a la Consola Operativa (`/gestionar`, Módulo 5.2, sin cambios) -- el
 * mismo botón de siempre, ahora consciente de en qué fase está el remate.
 */
export function RematadorRemateCard({ remate, onChanged }: RematadorRemateCardProps) {
  const navigate = useNavigate();
  const { loteCount, activeLote, nextLote, connectedUsers, isLoadingLotes } = useRemateOperationalInfo(
    remate.id,
    remate.status,
  );
  const [pendingAction, setPendingAction] = useState<LifecycleAction | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDuplicating, setIsDuplicating] = useState(false);

  const isDraft = remate.status === 'draft';
  const isEditableStructure = remate.status === 'draft' || remate.status === 'scheduled';
  const isCancellable =
    remate.status === 'draft' || remate.status === 'scheduled' || remate.status === 'live' || remate.status === 'paused';
  const isPreparing = remate.status === 'draft' || remate.status === 'scheduled';

  async function handlePublish() {
    try {
      await scheduleRemateRequest(remate.id);
      useToastStore.getState().push('success', 'El remate se publicó.');
      onChanged();
    } catch (err) {
      useToastStore.getState().push('error', normalizeApiError(err).message);
    }
  }

  async function handleDuplicate() {
    setIsDuplicating(true);
    try {
      const created = await duplicateRemate(remate);
      useToastStore.getState().push('success', 'Se creó una copia del remate.');
      onChanged();
      navigate(`/remates/${created.id}/lotes`);
    } catch (err) {
      useToastStore.getState().push('error', normalizeApiError(err).message);
    } finally {
      setIsDuplicating(false);
    }
  }

  async function handleDelete() {
    await deleteRemateRequest(remate.id);
    useToastStore.getState().push('success', 'El remate se eliminó.');
    onChanged();
  }

  async function runAction(action: LifecycleAction) {
    if (action === 'finish') {
      const confirmed = window.confirm(
        `¿Finalizar "${remate.title}"? Esta acción no se puede deshacer.`,
      );
      if (!confirmed) return;
    }

    setPendingAction(action);
    try {
      await ACTION_REQUESTS[action](remate.id);
      useToastStore.getState().push('success', SUCCESS_MESSAGES[action]);
      onChanged();
    } catch (err) {
      useToastStore.getState().push('error', normalizeApiError(err).message);
    } finally {
      setPendingAction(null);
    }
  }

  const canStart = remate.status === 'scheduled';
  const canResume = remate.status === 'paused';
  const canFinish = remate.status === 'live';

  const startDisabled = isLoadingLotes || loteCount === 0;
  const finishDisabled = isLoadingLotes || activeLote !== null;

  return (
    <article className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">
            {CATEGORY_LABELS[remate.category]}
          </p>
          <h3 className="mt-1 truncate text-base font-semibold text-slate-900">{remate.title}</h3>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Badge variant={STATUS_BADGE_VARIANTS[remate.status]}>{STATUS_LABELS[remate.status]}</Badge>
          <DropdownMenu
            triggerLabel={`Más acciones para ${remate.title}`}
            items={[
              { label: 'Editar', onSelect: () => setIsEditModalOpen(true), disabled: !isEditableStructure },
              {
                label: 'Publicar remate',
                onSelect: () => void handlePublish(),
                disabled: !isDraft || !remate.starts_at,
              },
              { label: 'Duplicar', onSelect: () => void handleDuplicate() },
              { label: 'Cancelar remate', onSelect: () => setIsCancelModalOpen(true), disabled: !isCancellable },
              {
                label: 'Eliminar',
                onSelect: () => setIsDeleteModalOpen(true),
                disabled: !isDraft,
                variant: 'danger',
              },
            ]}
          />
        </div>
      </div>
      {isDuplicating && <p className="text-xs text-slate-400">Duplicando remate…</p>}

      <dl className="grid grid-cols-1 gap-2 text-sm text-slate-600 sm:grid-cols-2">
        <div className="flex items-center gap-2">
          <CalendarIcon className="h-4 w-4 shrink-0 text-slate-400" />
          <span>{remate.starts_at ? formatDateTime(remate.starts_at) : 'Sin fecha'}</span>
        </div>
        <div className="flex items-center gap-2">
          <BoxIcon className="h-4 w-4 shrink-0 text-slate-400" />
          <span>{loteCount === null ? 'Cargando lotes…' : `${loteCount} ${loteCount === 1 ? 'lote' : 'lotes'}`}</span>
        </div>
        {connectedUsers !== null && (
          <div className="flex items-center gap-2">
            <UsersIcon className="h-4 w-4 shrink-0 text-slate-400" />
            <span>
              {connectedUsers} {connectedUsers === 1 ? 'conectado' : 'conectados'}
            </span>
          </div>
        )}
        <div className="col-span-full truncate text-slate-500">
          {describeLoteState(loteCount, activeLote, nextLote)}
        </div>
      </dl>

      <div className="mt-auto flex flex-wrap gap-2 border-t border-slate-100 pt-3">
        <Button variant="secondary" onClick={() => navigate(`/remates/${remate.id}`)}>
          Ver remate
        </Button>
        <Button
          variant="secondary"
          onClick={() => navigate(`/remates/${remate.id}/${isPreparing ? 'lotes' : 'gestionar'}`)}
        >
          {isPreparing ? 'Preparar lotes' : 'Administrar'}
        </Button>

        {canStart && (
          <Button
            onClick={() => runAction('start')}
            isLoading={pendingAction === 'start'}
            disabled={startDisabled || pendingAction !== null}
            title={startDisabled ? 'Cargá al menos un lote antes de iniciar el remate.' : undefined}
          >
            {ACTION_LABELS.start}
          </Button>
        )}
        {canResume && (
          <Button onClick={() => runAction('resume')} isLoading={pendingAction === 'resume'} disabled={pendingAction !== null}>
            {ACTION_LABELS.resume}
          </Button>
        )}
        {canFinish && (
          <Button
            variant="danger"
            onClick={() => runAction('finish')}
            isLoading={pendingAction === 'finish'}
            disabled={finishDisabled || pendingAction !== null}
            title={finishDisabled ? 'Cerrá el lote abierto antes de finalizar el remate.' : undefined}
          >
            {ACTION_LABELS.finish}
          </Button>
        )}
      </div>

      <RemateFormModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        remate={remate}
        onSaved={onChanged}
      />

      <CancelRemateModal
        isOpen={isCancelModalOpen}
        onClose={() => setIsCancelModalOpen(false)}
        remate={remate}
        onCancelled={onChanged}
      />

      <ConfirmModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={handleDelete}
        title="Eliminar remate"
        message={`¿Seguro que querés eliminar "${remate.title}"? Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        variant="danger"
      />
    </article>
  );
}
