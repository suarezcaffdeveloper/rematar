import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Clock, Lock, Radio } from 'lucide-react';
import { Button } from '../../../shared/components/Button';
import { ConfirmModal } from '../../../shared/components/ConfirmModal';
import { DropdownMenu } from '../../../shared/components/DropdownMenu';
import { normalizeApiError } from '../../../shared/api/errors';
import { formatDateTime } from '../../../shared/lib/format';
import { useToastStore } from '../../../shared/toast/toastStore';
import { deleteRemateRequest, scheduleRemateRequest, startRemateRequest } from '../../remates/api';
import { LotesCollagePlaceholder } from '../../remates/components/LotesCollagePlaceholder';
import { CATEGORY_SHORT_LABELS } from '../../remates/labels';
import type { Remate } from '../../remates/types';
import { describeNextStep, isTimed, lifecycleLabels, lifecycleStageIndex } from '../dashboard';
import { duplicateRemate } from '../duplication';
import { useRemateOperationalInfo } from '../hooks';
import { CancelRemateModal } from './CancelRemateModal';
import { RemateStatusPill } from './dashboard/RemateStatusPill';
import { PrivateAccessCredentialsPopover } from './PrivateAccessCredentialsPopover';
import { RemateFormModal } from './RemateFormModal';
import { optimizedImage } from '../../../shared/lib/image';

export interface RematadorRemateCardProps {
  remate: Remate;
  /** Se llama después de que una acción de ciclo de vida termina con éxito, para que el
   * dashboard recargue la lista y refleje el nuevo estado -- esta tarjeta no sabe nada
   * de la lista que la contiene, solo avisa "algo cambió" (mismo criterio que
   * `reload()` en el resto de los hooks del proyecto). */
  onChanged: () => void;
  /** Se llama tras iniciar el remate con éxito, con el remate ya actualizado (`live`) --
   * el cartel de redirección a la Consola Operativa vive en el dashboard, no acá (ver
   * `RematadorDashboardPage`): `onChanged` dispara `reload()`, que mientras la lista
   * recarga desmonta brevemente esta tarjeta (pasa a mostrar esqueletos) y con ella se
   * perdía el timer del cartel -- nunca llegaba a redirigir. */
  onStarted: (remate: Remate) => void;
  /** Abre el panel lateral del código de operador. Sin esto, "Generar código" lleva a la
   * pantalla de gestión del remate. */
  onOpenOperatorCode?: (remate: Remate) => void;
  /** Breve resalte (2s) sobre la tarjeta del remate recién publicado, al volver del
   * flujo de "Publicar remate" en Gestión de Lotes -- lo decide el dashboard, que sabe
   * qué remate viene resaltado (ver `RematadorDashboardPage`). */
  isHighlighted?: boolean;
}

const NEXT_STEP_TONE: Record<'urgent' | 'warn' | 'default', string> = {
  urgent: 'font-semibold text-danger-600',
  warn: 'font-semibold text-warning-700',
  default: 'text-ink',
};

/**
 * Tarjeta de un remate propio en el panel de la empresa (Épica 5, Módulo 5.1; rediseño
 * editorial). Cada tarjeta responde a tres preguntas sin entrar al remate:
 *
 * 1. ¿En qué etapa está? -- la "ruta de vida" (borrador, programado, en curso, finalizado),
 *    cuatro tramos con el actual resaltado.
 * 2. ¿Qué sigue? -- una frase (`describeNextStep`) que depende del estado, de la modalidad
 *    y de los lotes. Un Timed programado dice que arranca solo, en vez de ofrecer "Iniciar".
 * 3. ¿Qué hago ahora? -- un único botón principal con ese siguiente paso. Todo lo demás
 *    (editar, publicar, duplicar, cancelar, eliminar, iniciar) vive en el menú "⋯", que
 *    no depende de la etapa -- ver `docs/31-gestion-remates-lotes.md`.
 *
 * Los datos operativos (lotes, conectados, lote activo) vienen de `useRemateOperationalInfo`.
 */
export function RematadorRemateCard({ remate, onChanged, onStarted, onOpenOperatorCode, isHighlighted }: RematadorRemateCardProps) {
  const navigate = useNavigate();
  const { loteCount, activeLote, connectedUsers, coverImages, isLoadingLotes } = useRemateOperationalInfo(
    remate.id,
    remate.status,
  );
  const [isStarting, setIsStarting] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDuplicating, setIsDuplicating] = useState(false);
  const [isPrivateAccessModalOpen, setIsPrivateAccessModalOpen] = useState(false);

  const timed = isTimed(remate);
  const isDraft = remate.status === 'draft';
  const isEditableStructure = remate.status === 'draft' || remate.status === 'scheduled';
  const isCancellable =
    remate.status === 'draft' || remate.status === 'scheduled' || remate.status === 'live' || remate.status === 'paused';
  // Mismo criterio que `showPrivateAccessPanel` en ConsolaOperativaPage: visible en
  // cualquier estado no terminal -- a diferencia de ese panel, acá no hace falta
  // chequear `isOwner`, porque el dashboard de la empresa solo lista remates propios.
  const showPrivateAccessButton =
    remate.access_type === 'private' && remate.status !== 'finished' && remate.status !== 'cancelled';
  // `draft` (nunca se publicó, no hay nada que auditar) o `cancelled` (ya es terminal;
  // su motivo de cancelación queda asentado aparte, en el log de auditoría, borrar el
  // remate no lo hace desaparecer) -- ver `RemateService.soft_delete` para por qué
  // `finished` queda deliberadamente afuera: ese estado sí tiene resultados de venta
  // reales que dependen de poder resolver el remate por id (`HistoryService`), y
  // borrarlo dejaría "Ver resumen" con un 404 permanente.
  const isDeletable = remate.status === 'draft' || remate.status === 'cancelled';
  // Un Timed arranca solo al llegar `starts_at` (lo rechaza el backend si se intenta a
  // mano), y un `draft` primero hay que publicarlo.
  const canStartManually = remate.status === 'scheduled' && !timed;

  const next = describeNextStep(remate, {
    loteCount: isLoadingLotes ? null : loteCount,
    activeLoteTitle: activeLote?.title ?? null,
    now: Date.now(),
  });
  const stage = lifecycleStageIndex(remate.status);
  const stageLabels = lifecycleLabels(remate);
  const isCancelled = remate.status === 'cancelled';

  async function handlePublish() {
    setIsPublishing(true);
    try {
      await scheduleRemateRequest(remate.id);
      useToastStore.getState().push('success', 'El remate se publicó.');
      onChanged();
    } catch (err) {
      useToastStore.getState().push('error', normalizeApiError(err).message);
    } finally {
      setIsPublishing(false);
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
    try {
      await deleteRemateRequest(remate.id);
      useToastStore.getState().push('success', 'El remate se eliminó.');
      onChanged();
    } catch (err) {
      useToastStore.getState().push('error', normalizeApiError(err).message);
    }
  }

  async function handleStart() {
    setIsStarting(true);
    try {
      const updated = await startRemateRequest(remate.id);
      onChanged();
      // En vez de un toast que la empresa podría no llegar a leer, el dashboard
      // muestra un cartel que anticipa la redirección automática a la Consola Operativa
      // -- pedido explícito: no que busque el remate y entre solo, sino que lo lleve
      // directo a gestionarlo.
      onStarted(updated);
    } catch (err) {
      useToastStore.getState().push('error', normalizeApiError(err).message);
    } finally {
      setIsStarting(false);
    }
  }

  const startBlockedReason =
    loteCount === 0 && !isLoadingLotes ? 'Cargá al menos un lote antes de iniciar el remate.' : undefined;

  function handlePrimaryAction() {
    if (next.action === 'start') void handleStart();
    else if (next.action === 'publish') void handlePublish();
    else if (next.action === 'operator-code' && onOpenOperatorCode) onOpenOperatorCode(remate);
    else navigate(next.to);
  }

  const primaryBusy = next.action === 'start' ? isStarting : next.action === 'publish' ? isPublishing : false;
  const primaryDisabled = primaryBusy || (next.action === 'start' && Boolean(next.blockedReason ?? startBlockedReason));
  const primaryTitle = next.action === 'start' ? (next.blockedReason ?? startBlockedReason) : undefined;
  const isPrimaryEmphasis = next.tone === 'urgent' || next.action === 'publish';

  return (
    <article className="group relative flex min-w-0 flex-col">
      <div className="relative aspect-[16/10] w-full shrink-0 overflow-hidden rounded-2xl bg-surface-subtle">
        {remate.cover_image_url ? (
          <img
            src={optimizedImage(remate.cover_image_url, 480)}
            loading="lazy" decoding="async"
            alt=""
            className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
          />
        ) : (
          <LotesCollagePlaceholder images={coverImages} className="h-full w-full" />
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink/55 via-transparent to-transparent" />

        <div className="absolute inset-x-3 top-3 flex items-start justify-between gap-2">
          <RemateStatusPill remate={remate} className="shadow-sm" />
          {showPrivateAccessButton && (
            <button
              type="button"
              onClick={() => setIsPrivateAccessModalOpen(true)}
              className="flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-xs font-semibold text-ink-muted shadow-sm backdrop-blur-sm transition-colors hover:bg-white hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <Lock aria-hidden="true" className="h-3 w-3" />
              Copiar credenciales
            </button>
          )}
        </div>

        <span className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-ink/55 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur-md">
          {timed ? <Clock aria-hidden="true" className="h-3 w-3" /> : <Radio aria-hidden="true" className="h-3 w-3" />}
          {timed ? 'Timed' : 'En vivo con rematador'}
        </span>
      </div>

      <h3 className="mt-4 line-clamp-2 text-xl font-semibold leading-snug tracking-tight text-ink">{remate.title}</h3>
      <p className="mt-1 text-sm text-ink-muted">
        {[
          CATEGORY_SHORT_LABELS[remate.category],
          loteCount === null ? null : `${loteCount} ${loteCount === 1 ? 'lote' : 'lotes'}`,
          remate.starts_at ? formatDateTime(remate.starts_at) : 'Sin fecha',
          connectedUsers !== null ? `${connectedUsers} ${connectedUsers === 1 ? 'conectado' : 'conectados'}` : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      </p>
      {isDuplicating && <p className="mt-1 text-xs text-ink-faint">Duplicando remate…</p>}

      <div className="mt-4" role="img" aria-label={`Etapa: ${stageLabels[stage]}${isCancelled ? ' (cancelado)' : ''}`}>
        <div className="grid grid-cols-4 gap-1" aria-hidden="true">
          {stageLabels.map((label, index) => {
            const done = !isCancelled && index < stage;
            const current = !isCancelled && index === stage;
            return (
              <span
                key={label}
                className={`h-1 rounded-full ${
                  done ? 'bg-ink' : current ? (remate.status === 'paused' ? 'bg-warning-500' : 'bg-brand-600') : 'bg-line-strong'
                }`}
              />
            );
          })}
        </div>
        <div className="mt-1.5 grid grid-cols-4 gap-1 text-[11px] text-ink-faint" aria-hidden="true">
          {stageLabels.map((label, index) => (
            <span key={label} className={!isCancelled && index === stage ? 'font-bold text-ink' : undefined}>
              {label}
            </span>
          ))}
        </div>
      </div>

      <p className={`mt-3 flex-1 text-sm leading-relaxed ${NEXT_STEP_TONE[next.tone]}`}>{next.text}</p>

      <div className="mt-4 flex items-center gap-2">
        <Button
          variant={isPrimaryEmphasis ? 'primary' : 'hero'}
          className="h-10 flex-1 justify-center rounded-full px-4"
          onClick={handlePrimaryAction}
          isLoading={primaryBusy}
          disabled={primaryDisabled}
          title={primaryTitle}
        >
          {next.actionLabel}
        </Button>
        <div className="shrink-0 rounded-full border border-line-strong">
          <DropdownMenu
            triggerLabel={`Más acciones para ${remate.title}`}
            items={[
              { label: 'Editar', onSelect: () => setIsEditModalOpen(true), disabled: !isEditableStructure },
              {
                label: 'Administrar lotes',
                onSelect: () => navigate(`/remates/${remate.id}/lotes`),
                disabled: !isEditableStructure,
              },
              {
                label: 'Publicar remate',
                onSelect: () => void handlePublish(),
                disabled: !isDraft || !remate.starts_at,
              },
              {
                label: 'Iniciar remate',
                onSelect: () => void handleStart(),
                disabled: !canStartManually || Boolean(startBlockedReason) || isStarting,
              },
              { label: 'Duplicar', onSelect: () => void handleDuplicate() },
              { label: 'Cancelar remate', onSelect: () => setIsCancelModalOpen(true), disabled: !isCancellable },
              {
                label: 'Eliminar',
                onSelect: () => setIsDeleteModalOpen(true),
                disabled: !isDeletable,
                variant: 'danger',
              },
            ]}
          />
        </div>
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

      {showPrivateAccessButton && (
        <PrivateAccessCredentialsPopover
          isOpen={isPrivateAccessModalOpen}
          onClose={() => setIsPrivateAccessModalOpen(false)}
          remate={remate}
        />
      )}

      {isHighlighted && (
        <>
          <span className="sr-only" role="status" aria-label="Remate publicado">
            Remate publicado
          </span>
          <motion.div
            aria-hidden="true"
            className="pointer-events-none absolute -inset-2 z-20 rounded-3xl bg-gradient-to-br from-brand-400/30 via-brand-300/10 to-transparent"
            initial={{ opacity: 1 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 2, ease: 'easeOut' }}
          />
        </>
      )}
    </article>
  );
}
