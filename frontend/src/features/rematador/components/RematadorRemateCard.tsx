import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { Badge } from '../../../shared/components/Badge';
import { Button } from '../../../shared/components/Button';
import { ConfirmModal } from '../../../shared/components/ConfirmModal';
import { DropdownMenu } from '../../../shared/components/DropdownMenu';
import { normalizeApiError } from '../../../shared/api/errors';
import { formatDateTime } from '../../../shared/lib/format';
import { useToastStore } from '../../../shared/toast/toastStore';
import { deleteRemateRequest, scheduleRemateRequest, startRemateRequest } from '../../remates/api';
import { LotesCollagePlaceholder } from '../../remates/components/LotesCollagePlaceholder';
import { BoxIcon, CalendarIcon, UsersIcon } from '../../remates/components/icons';
import { CATEGORY_LABELS, STATUS_BADGE_VARIANTS, STATUS_CARD_ACCENT, STATUS_LABELS } from '../../remates/labels';
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
  /** Se llama tras iniciar el remate con éxito, con el remate ya actualizado (`live`) --
   * el cartel de redirección a la Consola Operativa vive en el dashboard, no acá (ver
   * `RematadorDashboardPage`): `onChanged` dispara `reload()`, que mientras la lista
   * recarga desmonta brevemente esta tarjeta (pasa a mostrar esqueletos) y con ella se
   * perdía el timer del cartel -- nunca llegaba a redirigir. */
  onStarted: (remate: Remate) => void;
  /** Breve resalte (2s) sobre la tarjeta del remate recién publicado, al volver del
   * flujo de "Publicar remate" en Gestión de Lotes -- lo decide el dashboard, que sabe
   * qué remate viene resaltado (ver `RematadorDashboardPage`). */
  isHighlighted?: boolean;
}

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
 * datos operativos (lote activo/próximo, conectados) y, en el pie, siempre exactamente
 * dos botones cuyo par depende del `status` -- pensado así a propósito para que las
 * tarjetas midan todas lo mismo sin importar el estado (nunca hay una fila condicional
 * de más o de menos):
 * - `draft`/`scheduled` ("pendiente"): "Preparar lotes" (a `/lotes`) e "Iniciar remate"
 *   (deshabilitado si es `draft` -- falta publicar -- o si todavía no tiene lotes).
 * - `live`/`paused` ("en vivo"): "Administrar" (a la Consola Operativa, `/gestionar`,
 *   Módulo 5.2, donde vive "Pausar"/"Reanudar"/"Finalizar") y "Ver detalle" (a la ficha
 *   pública del remate).
 * - `finished`/`cancelled` ("finalizado"): un único botón "Ver resumen" (a `/historial`,
 *   ahora el informe ejecutivo del remate) que ocupa las dos columnas del grid -- es el
 *   único estado con un solo botón, a propósito: no hay una segunda acción que tenga
 *   sentido acá.
 *
 * El menú "⋯" (editar/publicar/duplicar/cancelar/eliminar, Épica 5, Módulo 5.3, ver
 * `docs/31-gestion-remates-lotes.md`) no depende de este agrupamiento.
 */
export function RematadorRemateCard({ remate, onChanged, onStarted, isHighlighted }: RematadorRemateCardProps) {
  const navigate = useNavigate();
  const prefersReducedMotion = useReducedMotion();
  const { loteCount, activeLote, nextLote, connectedUsers, coverImages, isLoadingLotes } = useRemateOperationalInfo(
    remate.id,
    remate.status,
  );
  const [isStarting, setIsStarting] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDuplicating, setIsDuplicating] = useState(false);

  const isDraft = remate.status === 'draft';
  const isEditableStructure = remate.status === 'draft' || remate.status === 'scheduled';
  const isCancellable =
    remate.status === 'draft' || remate.status === 'scheduled' || remate.status === 'live' || remate.status === 'paused';
  // `draft` (nunca se publicó, no hay nada que auditar) o `cancelled` (ya es terminal;
  // su motivo de cancelación queda asentado aparte, en el log de auditoría, borrar el
  // remate no lo hace desaparecer) -- ver `RemateService.soft_delete` para por qué
  // `finished` queda deliberadamente afuera: ese estado sí tiene resultados de venta
  // reales que dependen de poder resolver el remate por id (`HistoryService`), y
  // borrarlo dejaría "Ver resumen" con un 404 permanente.
  const isDeletable = remate.status === 'draft' || remate.status === 'cancelled';
  const isPreparing = remate.status === 'draft' || remate.status === 'scheduled';
  const isOperating = remate.status === 'live' || remate.status === 'paused';
  const isTerminal = remate.status === 'finished' || remate.status === 'cancelled';

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
      // En vez de un toast que el rematador podría no llegar a leer, el dashboard
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

  const startDisabled = isLoadingLotes || loteCount === 0;
  const startBlockedReason = isDraft
    ? 'Publicá el remate antes de iniciarlo.'
    : startDisabled
      ? 'Cargá al menos un lote antes de iniciar el remate.'
      : undefined;

  return (
    <article
      className={`group relative flex flex-col overflow-hidden rounded-2xl border bg-white transition-all duration-300 hover:-translate-y-1 ${STATUS_CARD_ACCENT}`}
    >
      <div className="relative aspect-[16/10] w-full shrink-0 overflow-hidden bg-surface-subtle">
        {remate.cover_image_url ? (
          <img
            src={remate.cover_image_url}
            alt=""
            className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
          />
        ) : (
          <LotesCollagePlaceholder images={coverImages} className="h-full w-full" />
        )}
      </div>

      {/* Fuera del contenedor de la imagen (que recorta con `overflow-hidden` a solo
          ~175px de alto): el panel del menú necesita más espacio del que esa caja tiene
          para desplegar sus 5 ítems, así que quedaba cortado -- ni se veía completo ni se
          podía clickear. Acá, anclado al `<article>` completo (mucho más alto), tiene
          lugar de sobra. `z-10` para pintar por encima de la imagen sin depender del
          orden en el DOM. */}
      <div className="absolute inset-x-3 top-3 z-10 flex items-start justify-between gap-2">
        <Badge variant={STATUS_BADGE_VARIANTS[remate.status]} className="shadow-sm">
          {STATUS_LABELS[remate.status]}
        </Badge>
        <div className="shrink-0 rounded-full bg-white/90 shadow-sm backdrop-blur-sm">
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
                disabled: !isDeletable,
                variant: 'danger',
              },
            ]}
          />
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-4 p-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">
            {CATEGORY_LABELS[remate.category]}
          </p>
          <h3 className="mt-1.5 line-clamp-2 text-lg font-semibold leading-snug text-ink">{remate.title}</h3>
        </div>

        {isDuplicating && <p className="text-xs text-ink-faint">Duplicando remate…</p>}

        <dl className="grid grid-cols-1 gap-2 text-sm text-ink-muted sm:grid-cols-2">
          <div className="flex items-center gap-2">
            <CalendarIcon className="h-4 w-4 shrink-0 text-ink-faint" />
            <span>{remate.starts_at ? formatDateTime(remate.starts_at) : 'Sin fecha'}</span>
          </div>
          <div className="flex items-center gap-2">
            <BoxIcon className="h-4 w-4 shrink-0 text-ink-faint" />
            <span>{loteCount === null ? 'Cargando lotes…' : `${loteCount} ${loteCount === 1 ? 'lote' : 'lotes'}`}</span>
          </div>
          {connectedUsers !== null && (
            <div className="flex items-center gap-2">
              <UsersIcon className="h-4 w-4 shrink-0 text-ink-faint" />
              <span>
                {connectedUsers} {connectedUsers === 1 ? 'conectado' : 'conectados'}
              </span>
            </div>
          )}
          <div className="col-span-full truncate text-ink-muted">
            {describeLoteState(loteCount, activeLote, nextLote)}
          </div>
        </dl>

        <div className="mt-auto grid grid-cols-2 gap-2 border-t border-line pt-4">
          {isPreparing && (
            <>
              <Button
                variant="secondary"
                className="h-10 w-full justify-center px-3"
                onClick={() => navigate(`/remates/${remate.id}/lotes`)}
              >
                Preparar lotes
              </Button>
              <Button
                className="h-10 w-full justify-center px-3"
                onClick={() => void handleStart()}
                isLoading={isStarting}
                disabled={isDraft || startDisabled || isStarting}
                title={startBlockedReason}
              >
                Iniciar remate
              </Button>
            </>
          )}
          {isOperating && (
            <>
              <Button
                variant="secondary"
                className="h-10 w-full justify-center px-3"
                onClick={() => navigate(`/remates/${remate.id}/gestionar`)}
              >
                Administrar
              </Button>
              <Button
                variant="secondary"
                className="h-10 w-full justify-center px-3"
                onClick={() => navigate(`/remates/${remate.id}`)}
              >
                Ver detalle
              </Button>
            </>
          )}
          {isTerminal && (
            <div className="col-span-2">
              <motion.div
                whileHover={prefersReducedMotion ? undefined : { scale: 1.02, y: -2 }}
                whileTap={prefersReducedMotion ? undefined : { scale: 0.98 }}
              >
                <Button
                  variant="secondary"
                  className="h-10 w-full justify-center px-3"
                  onClick={() => navigate(`/remates/${remate.id}/historial`)}
                >
                  Ver resumen
                </Button>
              </motion.div>
            </div>
          )}
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

      {isHighlighted && (
        <>
          <span className="sr-only" role="status" aria-label="Remate publicado">
            Remate publicado
          </span>
          <motion.div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-20 rounded-xl bg-gradient-to-br from-brand-400/30 via-brand-300/10 to-transparent"
            initial={{ opacity: 1 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 2, ease: 'easeOut' }}
          />
        </>
      )}
    </article>
  );
}
