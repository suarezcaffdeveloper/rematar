import { type DragEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowUpDown, Filter, PackageOpen } from 'lucide-react';
import { useBreadcrumb } from '../../../app/layouts/useBreadcrumb';
import { normalizeApiError } from '../../../shared/api/errors';
import { Alert } from '../../../shared/components/Alert';
import type { BreadcrumbItem } from '../../../shared/components/Breadcrumb';
import { Button } from '../../../shared/components/Button';
import { ConfirmModal } from '../../../shared/components/ConfirmModal';
import { EmptyState } from '../../../shared/components/EmptyState';
import { FIELD_CONTROL_CLASSES } from '../../../shared/components/FieldWrapper';
import { Skeleton } from '../../../shared/components/Skeleton';
import { useToastStore } from '../../../shared/toast/toastStore';
import {
  deleteLoteRequest,
  deleteRemateRequest,
  reorderLotesRequest,
  scheduleRemateRequest,
} from '../../remates/api';
import { SearchIcon } from '../../remates/components/icons';
import { useLotes, useRemateDetail } from '../../remates/hooks';
import type { Lote } from '../../remates/types';
import { AddLoteButton } from '../components/AddLoteButton';
import { CancelRemateModal } from '../components/CancelRemateModal';
import { SendIcon } from '../components/icons';
import { LoteFormModal } from '../components/LoteFormModal';
import { LoteManagementCard } from '../components/LoteManagementCard';
import { LoteManagementCardSkeleton } from '../components/LoteManagementCardSkeleton';
import { LotesSummaryChips } from '../components/LotesSummaryChips';
import { RemateFormModal } from '../components/RemateFormModal';
import { RemateManagementSidebar } from '../components/RemateManagementSidebar';
import { RematePublicadoOverlay } from '../components/RematePublicadoOverlay';
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
 *
 * Rediseño a "centro de preparación del remate": toda la pantalla gira alrededor de los
 * lotes. Las acciones de ciclo de vida del remate (editar/duplicar/auditoría/cancelar/
 * eliminar) se agrupan en `RemateManagementSidebar` bajo "Configuración del remate";
 * "Agregar lote" y "Publicar remate" son las dos únicas acciones con peso visual propio.
 * El buscador filtra client-side sobre los `lotes` ya cargados -- "Filtrar"/"Ordenar"
 * quedan como controles deshabilitados, a propósito (pedido explícito: dejar la interfaz
 * preparada para esas mejoras sin inventar comportamiento que el backend no soporta).
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

  const [searchQuery, setSearchQuery] = useState('');

  const [isRemateModalOpen, setIsRemateModalOpen] = useState(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [isDeleteRemateModalOpen, setIsDeleteRemateModalOpen] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isPublishedOverlayOpen, setIsPublishedOverlayOpen] = useState(false);
  const [isDuplicatingRemate, setIsDuplicatingRemate] = useState(false);

  const [loteModalState, setLoteModalState] = useState<{ mode: 'create' } | { mode: 'edit'; lote: Lote } | null>(
    null,
  );
  const [deletingLote, setDeletingLote] = useState<Lote | null>(null);
  const [duplicatingLoteId, setDuplicatingLoteId] = useState<string | null>(null);

  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const isStructureEditable = remate?.status === 'draft' || remate?.status === 'scheduled';
  const isDraft = remate?.status === 'draft';
  const canPublish = isDraft && Boolean(remate?.starts_at) && lotes.length > 0;
  const publishBlockedReason = !remate?.starts_at
    ? 'Definí una fecha de inicio (Configuración del remate → Editar remate) antes de publicar.'
    : lotes.length === 0
      ? 'Debés cargar al menos un lote para publicar el remate.'
      : undefined;

  const filteredLotes = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return lotes;
    return lotes.filter(
      (lote) => lote.title.toLowerCase().includes(query) || lote.lot_number.toLowerCase().includes(query),
    );
  }, [lotes, searchQuery]);

  const breadcrumbItems: BreadcrumbItem[] = isRemateLoading
    ? []
    : remateError || !remate
      ? [{ label: 'Mis remates', to: '/' }, { label: 'Remate no encontrado' }]
      : [{ label: 'Mis remates', to: '/' }, { label: remate.title }];
  useBreadcrumb(breadcrumbItems);

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
      setIsPublishing(false);
      // Mismo cartel de redirección que "Iniciar remate" (Épica 5, Módulo 5.1) -- pedido
      // explícito: que los dos flujos automáticos se sientan iguales. La navegación real
      // a "Mis remates" la dispara el propio cartel al autodescartarse
      // (`RematePublicadoOverlay` → `TransitionOverlay`), no acá.
      setIsPublishedOverlayOpen(true);
    } catch (err) {
      useToastStore.getState().push('error', normalizeApiError(err).message);
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
    <div className="flex flex-col gap-8 pb-20 font-display">
      <div className="flex flex-col gap-3 border-b border-line pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">Preparación del Remate</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-muted">
            Complete y organice los lotes que formarán parte del remate. Cuando todo esté listo podrá publicarlo y
            comenzar la subasta.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-5 lg:flex-row">
        <RemateManagementSidebar
          remate={remate}
          onEdit={() => setIsRemateModalOpen(true)}
          onCancel={() => setIsCancelModalOpen(true)}
          onDelete={() => setIsDeleteRemateModalOpen(true)}
          onDuplicate={handleDuplicateRemate}
          onViewAudit={() => navigate(`/remates/${id}/auditoria`)}
          isDuplicating={isDuplicatingRemate}
        />

        <div className="flex flex-1 flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-ink">Lotes</h2>
            {isStructureEditable && <AddLoteButton onClick={() => setLoteModalState({ mode: 'create' })} />}
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
              icon={<PackageOpen className="h-10 w-10" aria-hidden="true" />}
              title="Aún no agregaste ningún lote"
              description="Los lotes son los productos que participarán del remate. Comenzá creando el primero."
              action={
                isStructureEditable ? (
                  <AddLoteButton onClick={() => setLoteModalState({ mode: 'create' })} label="Crear primer lote" />
                ) : undefined
              }
            />
          )}

          {!isLotesLoading && !lotesError && lotes.length > 0 && (
            <>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <LotesSummaryChips lotes={lotes} />

                <div className="flex items-center gap-2">
                  <div className="relative">
                    <label htmlFor="lote-search" className="sr-only">
                      Buscar lote
                    </label>
                    <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      id="lote-search"
                      type="search"
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      placeholder="Buscar lote..."
                      className={`${FIELD_CONTROL_CLASSES} w-48 border-slate-300 pl-9 sm:w-56`}
                    />
                  </div>
                  <Button variant="secondary" disabled title="Próximamente" className="!px-3">
                    <Filter className="h-4 w-4" aria-hidden="true" />
                    Filtrar
                  </Button>
                  <Button variant="secondary" disabled title="Próximamente" className="!px-3">
                    <ArrowUpDown className="h-4 w-4" aria-hidden="true" />
                    Ordenar
                  </Button>
                </div>
              </div>

              {filteredLotes.length === 0 ? (
                <p className="rounded-xl border border-dashed border-line-strong bg-white py-8 text-center text-sm text-ink-muted">
                  No encontramos lotes que coincidan con &quot;{searchQuery}&quot;.
                </p>
              ) : (
                <div className="flex flex-col gap-3">
                  {filteredLotes.map((lote) => {
                    const index = lotes.findIndex((l) => l.id === lote.id);
                    return (
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
                    );
                  })}
                </div>
              )}
            </>
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

      {isDraft && (
        <div className="fixed bottom-6 right-6 z-30">
          <div className="flex items-center gap-3 rounded-2xl border border-line bg-white/95 p-3 pl-4 shadow-xl backdrop-blur-sm">
            <span className="hidden text-sm text-ink-muted sm:block">
              {canPublish ? 'Todo listo para comenzar' : publishBlockedReason}
            </span>
            <Button
              onClick={handlePublish}
              isLoading={isPublishing}
              disabled={!canPublish}
              title={!canPublish ? publishBlockedReason : undefined}
              className="shadow-lg shadow-brand-600/20"
            >
              <SendIcon className="h-4 w-4" />
              Publicar remate
            </Button>
          </div>
        </div>
      )}

      <RematePublicadoOverlay
        isOpen={isPublishedOverlayOpen}
        onDone={() => navigate('/', { state: { highlightRemateId: id } })}
      />
    </div>
  );
}
