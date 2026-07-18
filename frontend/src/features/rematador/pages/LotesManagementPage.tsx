import { type DragEvent, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { normalizeApiError } from '../../../shared/api/errors';
import { Alert } from '../../../shared/components/Alert';
import { Breadcrumb } from '../../../shared/components/Breadcrumb';
import { Button } from '../../../shared/components/Button';
import { ConfirmModal } from '../../../shared/components/ConfirmModal';
import { EmptyState } from '../../../shared/components/EmptyState';
import { Skeleton } from '../../../shared/components/Skeleton';
import { useToastStore } from '../../../shared/toast/toastStore';
import {
  deleteLoteRequest,
  deleteRemateRequest,
  reorderLotesRequest,
  scheduleRemateRequest,
} from '../../remates/api';
import { GavelIcon } from '../../remates/components/icons';
import { useLotes, useRemateDetail } from '../../remates/hooks';
import type { Lote } from '../../remates/types';
import { CancelRemateModal } from '../components/CancelRemateModal';
import { PlusIcon } from '../components/icons';
import { LoteFormModal } from '../components/LoteFormModal';
import { LoteManagementCard } from '../components/LoteManagementCard';
import { LoteManagementCardSkeleton } from '../components/LoteManagementCardSkeleton';
import { RemateFormModal } from '../components/RemateFormModal';
import { RemateManagementSidebar } from '../components/RemateManagementSidebar';
import { duplicateLote, duplicateRemate } from '../duplication';

const LOTE_SKELETON_COUNT = 3;

/**
 * Gestión de Remates y Lotes (Épica 5, Módulo 5.3) -- donde el rematador prepara un
 * remate completo antes de que empiece: editar sus datos, publicarlo, y cargar/editar/
 * duplicar/reordenar sus lotes. Reusa `useRemateDetail`/`useLotes` de
 * `features/remates/hooks.ts` tal cual (Épica 4.4, sin modificarlos) -- misma fuente de
 * datos que ya usa `RemateDetailPage` para el comprador.
 *
 * La estructura de lotes (crear/editar/eliminar/reordenar) solo se habilita mientras el
 * remate está `draft`/`scheduled` (`LoteService._assert_structure_editable`, backend) --
 * una vez `live`, queda congelada; esta pantalla lo refleja deshabilitando esas acciones
 * en vez de dejar que el backend las rechace con un 422.
 */
export function LotesManagementPage() {
  const { remateId } = useParams<{ remateId: string }>();
  const navigate = useNavigate();
  const id = remateId ?? '';

  const { remate, isLoading: isRemateLoading, error: remateError, reload: reloadRemate } = useRemateDetail(id);
  const { lotes: fetchedLotes, isLoading: isLotesLoading, error: lotesError, reload: reloadLotes } = useLotes(id);

  const [lotes, setLotes] = useState<Lote[]>([]);
  useEffect(() => {
    setLotes(fetchedLotes);
  }, [fetchedLotes]);

  const [isRemateModalOpen, setIsRemateModalOpen] = useState(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [isDeleteRemateModalOpen, setIsDeleteRemateModalOpen] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isDuplicatingRemate, setIsDuplicatingRemate] = useState(false);

  const [loteModalState, setLoteModalState] = useState<{ mode: 'create' } | { mode: 'edit'; lote: Lote } | null>(
    null,
  );
  const [deletingLote, setDeletingLote] = useState<Lote | null>(null);
  const [duplicatingLoteId, setDuplicatingLoteId] = useState<string | null>(null);

  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const isStructureEditable = remate?.status === 'draft' || remate?.status === 'scheduled';

  async function persistReorder(newOrder: Lote[]) {
    const previous = lotes;
    setLotes(newOrder);
    try {
      await reorderLotesRequest(id, newOrder.map((lote) => lote.id));
    } catch (err) {
      setLotes(previous);
      useToastStore.getState().push('error', normalizeApiError(err).message);
    }
  }

  function moveLote(loteId: string, direction: -1 | 1) {
    const index = lotes.findIndex((lote) => lote.id === loteId);
    const targetIndex = index + direction;
    if (index === -1 || targetIndex < 0 || targetIndex >= lotes.length) return;
    const reordered = [...lotes];
    [reordered[index], reordered[targetIndex]] = [reordered[targetIndex], reordered[index]];
    void persistReorder(reordered);
  }

  function handleDrop(targetId: string) {
    return (event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      setDragOverId(null);
      if (!draggedId || draggedId === targetId) return;
      const fromIndex = lotes.findIndex((lote) => lote.id === draggedId);
      const toIndex = lotes.findIndex((lote) => lote.id === targetId);
      if (fromIndex === -1 || toIndex === -1) return;
      const reordered = [...lotes];
      const [moved] = reordered.splice(fromIndex, 1);
      reordered.splice(toIndex, 0, moved);
      void persistReorder(reordered);
    };
  }

  async function handlePublish() {
    setIsPublishing(true);
    try {
      await scheduleRemateRequest(id);
      useToastStore.getState().push('success', 'El remate se publicó.');
      reloadRemate();
    } catch (err) {
      useToastStore.getState().push('error', normalizeApiError(err).message);
    } finally {
      setIsPublishing(false);
    }
  }

  async function handleDuplicateRemate() {
    if (!remate) return;
    setIsDuplicatingRemate(true);
    try {
      const created = await duplicateRemate(remate);
      useToastStore.getState().push('success', 'Se creó una copia del remate.');
      navigate(`/remates/${created.id}/lotes`);
    } catch (err) {
      useToastStore.getState().push('error', normalizeApiError(err).message);
    } finally {
      setIsDuplicatingRemate(false);
    }
  }

  async function handleDeleteRemate() {
    await deleteRemateRequest(id);
    useToastStore.getState().push('success', 'El remate se eliminó.');
    navigate('/');
  }

  async function handleDeleteLote() {
    if (!deletingLote) return;
    try {
      await deleteLoteRequest(id, deletingLote.id);
      useToastStore.getState().push('success', 'El lote se eliminó.');
      setDeletingLote(null);
      reloadLotes();
    } catch (err) {
      useToastStore.getState().push('error', normalizeApiError(err).message);
    }
  }

  async function handleDuplicateLote(lote: Lote) {
    setDuplicatingLoteId(lote.id);
    try {
      await duplicateLote(
        id,
        lote,
        lotes.map((existing) => existing.lot_number),
      );
      useToastStore.getState().push('success', 'Se duplicó el lote.');
      reloadLotes();
    } catch (err) {
      useToastStore.getState().push('error', normalizeApiError(err).message);
    } finally {
      setDuplicatingLoteId(null);
    }
  }

  if (isRemateLoading) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-4 w-48" />
        <div className="flex flex-col gap-5 lg:flex-row">
          <Skeleton className="h-80 w-full lg:w-72" />
          <div className="flex flex-1 flex-col gap-3">
            {Array.from({ length: LOTE_SKELETON_COUNT }, (_, index) => (
              <LoteManagementCardSkeleton key={index} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (remateError || !remate) {
    return (
      <div className="flex flex-col gap-6">
        <Breadcrumb items={[{ label: 'Mis remates', to: '/' }, { label: 'Remate no encontrado' }]} />
        <Alert variant="error">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{remateError?.message ?? 'No se pudo cargar este remate.'}</span>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={reloadRemate}>
                Reintentar
              </Button>
              <Button variant="secondary" onClick={() => navigate('/')}>
                Volver al dashboard
              </Button>
            </div>
          </div>
        </Alert>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumb items={[{ label: 'Mis remates', to: '/' }, { label: remate.title }]} />

      <div className="flex flex-col gap-5 lg:flex-row">
        <RemateManagementSidebar
          remate={remate}
          loteCount={lotes.length}
          onEdit={() => setIsRemateModalOpen(true)}
          onPublish={handlePublish}
          onCancel={() => setIsCancelModalOpen(true)}
          onDelete={() => setIsDeleteRemateModalOpen(true)}
          onDuplicate={handleDuplicateRemate}
          isPublishing={isPublishing}
          isDuplicating={isDuplicatingRemate}
        />

        <div className="flex flex-1 flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-900">Lotes</h2>
            {isStructureEditable && (
              <Button onClick={() => setLoteModalState({ mode: 'create' })}>
                <PlusIcon className="h-4 w-4" />
                Agregar lote
              </Button>
            )}
          </div>

          {!isStructureEditable && (
            <Alert variant="info">
              La estructura de lotes está congelada porque el remate ya está{' '}
              {remate.status === 'live' || remate.status === 'paused' ? 'en vivo' : 'finalizado o cancelado'}.
            </Alert>
          )}

          {lotesError && (
            <Alert variant="error">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span>{lotesError.message}</span>
                <Button variant="secondary" onClick={reloadLotes}>
                  Reintentar
                </Button>
              </div>
            </Alert>
          )}

          {isLotesLoading && !lotesError && (
            <div className="flex flex-col gap-3">
              {Array.from({ length: LOTE_SKELETON_COUNT }, (_, index) => (
                <LoteManagementCardSkeleton key={index} />
              ))}
            </div>
          )}

          {!isLotesLoading && !lotesError && lotes.length === 0 && (
            <EmptyState
              icon={<GavelIcon className="h-10 w-10" />}
              title="Todavía no cargaste lotes"
              description="Agregá el primer lote para empezar a preparar este remate."
              action={
                isStructureEditable ? (
                  <Button onClick={() => setLoteModalState({ mode: 'create' })}>Agregar lote</Button>
                ) : undefined
              }
            />
          )}

          {!isLotesLoading && !lotesError && lotes.length > 0 && (
            <div className="flex flex-col gap-3">
              {lotes.map((lote, index) => (
                <LoteManagementCard
                  key={lote.id}
                  lote={lote}
                  currency={remate.settings.currency}
                  isEditable={isStructureEditable}
                  canMoveUp={index > 0}
                  canMoveDown={index < lotes.length - 1}
                  onEdit={() => setLoteModalState({ mode: 'edit', lote })}
                  onDuplicate={() => void handleDuplicateLote(lote)}
                  onDelete={() => setDeletingLote(lote)}
                  onMoveUp={() => moveLote(lote.id, -1)}
                  onMoveDown={() => moveLote(lote.id, 1)}
                  onDragStart={(event) => {
                    setDraggedId(lote.id);
                    event.dataTransfer.effectAllowed = 'move';
                  }}
                  onDragEnter={() => setDragOverId(lote.id)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={handleDrop(lote.id)}
                  onDragEnd={() => {
                    setDraggedId(null);
                    setDragOverId(null);
                  }}
                  isDragOver={dragOverId === lote.id && draggedId !== lote.id}
                  isDragging={draggedId === lote.id}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <RemateFormModal
        isOpen={isRemateModalOpen}
        onClose={() => setIsRemateModalOpen(false)}
        remate={remate}
        onSaved={() => reloadRemate()}
      />

      <CancelRemateModal
        isOpen={isCancelModalOpen}
        onClose={() => setIsCancelModalOpen(false)}
        remate={remate}
        onCancelled={() => reloadRemate()}
      />

      <ConfirmModal
        isOpen={isDeleteRemateModalOpen}
        onClose={() => setIsDeleteRemateModalOpen(false)}
        onConfirm={handleDeleteRemate}
        title="Eliminar remate"
        message={`¿Seguro que querés eliminar "${remate.title}"? Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        variant="danger"
      />

      {loteModalState && (
        <LoteFormModal
          isOpen
          onClose={() => setLoteModalState(null)}
          remateId={id}
          lote={loteModalState.mode === 'edit' ? loteModalState.lote : undefined}
          onSaved={() => reloadLotes()}
        />
      )}

      <ConfirmModal
        isOpen={Boolean(deletingLote)}
        onClose={() => setDeletingLote(null)}
        onConfirm={handleDeleteLote}
        title="Eliminar lote"
        message={`¿Seguro que querés eliminar el lote "${deletingLote?.title ?? ''}"? Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        variant="danger"
      />

      {duplicatingLoteId && (
        <span className="sr-only" role="status">
          Duplicando lote…
        </span>
      )}
    </div>
  );
}
