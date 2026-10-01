import { type DragEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Calendar, Eye, Globe, LayoutGrid, List, Lock, Plus, Radio, Search, ShieldCheck, Timer } from 'lucide-react';
import { useBreadcrumb } from '../../../app/layouts/useBreadcrumb';
import { useTopNavLayout } from '../../../app/layouts/useTopNavLayout';
import { normalizeApiError } from '../../../shared/api/errors';
import { Alert } from '../../../shared/components/Alert';
import type { BreadcrumbItem } from '../../../shared/components/Breadcrumb';
import { Button } from '../../../shared/components/Button';
import { ConfirmModal } from '../../../shared/components/ConfirmModal';
import { Skeleton } from '../../../shared/components/Skeleton';
import { formatDateTime } from '../../../shared/lib/format';
import { useToastStore } from '../../../shared/toast/toastStore';
import { deleteLoteRequest, deleteRemateRequest, reorderLotesRequest, scheduleRemateRequest } from '../../remates/api';
import { useLotes, useRemateDetail } from '../../remates/hooks';
import type { Lote } from '../../remates/types';
import { CancelRemateModal } from '../components/CancelRemateModal';
import { LoteDrawer } from '../components/LoteDrawer';
import { LoteManagementCardSkeleton } from '../components/LoteManagementCardSkeleton';
import { RemateFormModal } from '../components/RemateFormModal';
import { RemateSettingsMenu } from '../components/RemateSettingsMenu';
import { RematePublicadoOverlay } from '../components/RematePublicadoOverlay';
import { RemateStatusPill } from '../components/dashboard/RemateStatusPill';
import { SendIcon } from '../components/icons';
import { CatalogNumbers } from '../components/preparation/CatalogNumbers';
import { LoteCatalogCard } from '../components/preparation/LoteCatalogCard';
import { LoteOrderRow } from '../components/preparation/LoteOrderRow';
import { PreparationChecklist } from '../components/preparation/PreparationChecklist';
import { duplicateLote, duplicateRemate } from '../duplication';
import {
  buildPreparation,
  buildPreparationHeadline,
  filterLotes,
  type ChecklistAction,
  type LoteFilter,
} from '../preparation';

const LOTE_SKELETON_COUNT = 3;
const NEW_LOTE_HIGHLIGHT_MS = 1600;
const GRID_CLASSES = 'grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4';

const FILTERS: Array<{ value: LoteFilter; label: string }> = [
  { value: 'all', label: 'Todos' },
  { value: 'without-photo', label: 'Sin foto' },
  { value: 'with-reserve', label: 'Con reserva' },
];

type LoteDrawerState = { mode: 'create' } | { mode: 'edit'; lote: Lote } | null;

function SectionHeading({ id, title, description }: { id: string; title: string; description?: string }) {
  return (
    <div className="mb-6">
      <h2 id={id} className="text-2xl font-semibold tracking-tight sm:text-3xl">
        {title}
      </h2>
      {description && <p className="mt-1.5 max-w-[60ch] text-ink-muted">{description}</p>}
    </div>
  );
}

/**
 * Preparación del remate (Épica 5, Módulo 5.3; rediseño editorial sobre el mismo sistema
 * visual del panel principal de la empresa) -- donde se prepara un remate completo antes de
 * que empiece: sus lotes y su publicación. Reusa `useRemateDetail`/`useLotes` de
 * `features/remates/hooks.ts` tal cual -- misma fuente de datos que `RemateDetailPage`.
 *
 * De arriba a abajo: un titular que dice cuánto falta para publicar, "Antes de publicar"
 * (checklist de lo obligatorio y lo recomendado, ver `buildPreparation`), el catálogo en
 * números con el precio base de cada lote, y "Tus lotes" como galería (o lista en orden de
 * salida) con filtros y búsqueda. Crear y editar un lote se hace en `LoteDrawer`, un panel
 * lateral de tres pasos con la vista previa del comprador.
 *
 * La estructura de lotes (crear/editar/eliminar/reordenar) solo se habilita mientras el
 * remate está `draft`/`scheduled` (`LoteService._assert_structure_editable`, backend) -- una
 * vez en vivo queda congelada; la pantalla lo refleja pasando a solo lectura en vez de dejar
 * que el backend rechace esas acciones con un 422. Las acciones de ciclo de vida del remate
 * viven en `RemateSettingsMenu`.
 */
export function LotesManagementPage() {
  useTopNavLayout();
  const { remateId } = useParams<{ remateId: string }>();
  const navigate = useNavigate();
  const id = remateId ?? '';

  const { remate, isLoading: isRemateLoading, error: remateError, reload: reloadRemate } = useRemateDetail(id);
  const { lotes: fetchedLotes, isLoading: isLotesLoading, error: lotesError, reload: reloadLotes } = useLotes(id);

  const [lotes, setLotes] = useState<Lote[]>([]);
  useEffect(() => {
    setLotes(fetchedLotes);
  }, [fetchedLotes]);

  const [filter, setFilter] = useState<LoteFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [view, setView] = useState<'grid' | 'list'>('grid');

  const [isRemateModalOpen, setIsRemateModalOpen] = useState(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [isDeleteRemateModalOpen, setIsDeleteRemateModalOpen] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isPublishedOverlayOpen, setIsPublishedOverlayOpen] = useState(false);
  const [isDuplicatingRemate, setIsDuplicatingRemate] = useState(false);

  const [drawerState, setDrawerState] = useState<LoteDrawerState>(null);
  const [deletingLote, setDeletingLote] = useState<Lote | null>(null);
  const [duplicatingLoteId, setDuplicatingLoteId] = useState<string | null>(null);
  const [newLoteId, setNewLoteId] = useState<string | null>(null);

  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const [showStickyPublish, setShowStickyPublish] = useState(false);
  const heroPublishRef = useRef<HTMLDivElement>(null);
  const [now] = useState(() => Date.now());

  const isStructureEditable = remate?.status === 'draft' || remate?.status === 'scheduled';
  const isDraft = remate?.status === 'draft';
  const preparation = useMemo(() => (remate ? buildPreparation(remate, lotes, now) : null), [remate, lotes, now]);
  const canPublish = Boolean(preparation?.canPublish);
  const filteredLotes = useMemo(() => filterLotes(lotes, filter, searchQuery), [lotes, filter, searchQuery]);

  const breadcrumbItems: BreadcrumbItem[] = isRemateLoading
    ? []
    : remateError || !remate
      ? [{ label: 'Mis remates', to: '/' }, { label: 'Remate no encontrado' }]
      : [{ label: 'Mis remates', to: '/' }, { label: remate.title }];
  useBreadcrumb(breadcrumbItems);

  // La barra de "Publicar remate" solo aparece cuando el botón del encabezado ya salió de
  // la pantalla: mientras se ve el original, no hace falta un segundo.
  useEffect(() => {
    const target = heroPublishRef.current;
    if (!target || !isDraft || typeof IntersectionObserver === 'undefined') {
      setShowStickyPublish(false);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      setShowStickyPublish(!entry.isIntersecting && entry.boundingClientRect.top < 0);
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [isDraft, isRemateLoading]);

  function markAsNew(loteId: string) {
    setNewLoteId(loteId);
    window.setTimeout(() => setNewLoteId((current) => (current === loteId ? null : current)), NEW_LOTE_HIGHLIGHT_MS);
  }

  function scrollToLote(loteId: string) {
    setFilter('all');
    setSearchQuery('');
    window.requestAnimationFrame(() => {
      const element = document.querySelector<HTMLElement>(`[data-lote-id="${loteId}"]`);
      element?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
      element?.focus?.();
    });
  }

  function handleChecklistAction(action: ChecklistAction) {
    if (action === 'edit-remate') setIsRemateModalOpen(true);
    else if (action === 'add-lote') setDrawerState({ mode: 'create' });
    else {
      setFilter('without-photo');
      document.getElementById('lotes-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

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
      const created = await duplicateLote(
        id,
        lote,
        lotes.map((existing) => existing.lot_number),
      );
      useToastStore.getState().push('success', 'Se duplicó el lote.');
      if (created?.id) markAsNew(created.id);
      reloadLotes();
    } catch (err) {
      useToastStore.getState().push('error', normalizeApiError(err).message);
    } finally {
      setDuplicatingLoteId(null);
    }
  }

  if (isRemateLoading) {
    return (
      <div className="min-h-screen bg-white">
        <div className="mx-auto flex w-full max-w-[110rem] flex-col gap-8 px-3 py-8 sm:px-6 lg:px-10">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-32 w-full max-w-3xl rounded-2xl" />
          <div className={GRID_CLASSES}>
            {Array.from({ length: LOTE_SKELETON_COUNT }, (_, index) => (
              <LoteManagementCardSkeleton key={index} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (remateError || !remate || !preparation) {
    return (
      <div className="mx-auto w-full max-w-[110rem] px-3 py-8 sm:px-6 lg:px-10">
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

  const currency = remate.settings.currency;
  const timed = remate.auction_type === 'timed';
  const guaranteeAmount = remate.settings.guarantee_required ? remate.settings.guarantee_amount : null;
  const headline = buildPreparationHeadline(remate, preparation.blockers.length, canPublish);
  const hasLotes = !isLotesLoading && !lotesError && lotes.length > 0;
  const closeDrawer = () => setDrawerState(null);
  const addLote = () => setDrawerState({ mode: 'create' });

  function dragProps(lote: Lote) {
    return {
      onDragStart: (event: DragEvent<HTMLElement>) => {
        setDraggedId(lote.id);
        event.dataTransfer.effectAllowed = 'move';
      },
      onDragEnter: () => setDragOverId(lote.id),
      onDragOver: (event: DragEvent<HTMLElement>) => event.preventDefault(),
      onDrop: handleDrop(lote.id),
      onDragEnd: () => {
        setDraggedId(null);
        setDragOverId(null);
      },
      isDragOver: dragOverId === lote.id && draggedId !== lote.id,
      isDragging: draggedId === lote.id,
    };
  }

  return (
    <div className="min-h-screen bg-white pb-28 font-display text-ink">
      <div className="mx-auto w-full max-w-[110rem] px-3 py-8 sm:px-6 lg:px-10">
        <Link
          to="/"
          className="mb-6 inline-flex items-center gap-1.5 rounded-lg text-sm font-medium text-ink-muted transition-colors hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          Mis remates
        </Link>

        <header className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center gap-3">
            <RemateStatusPill remate={remate} />
            <span className="font-semibold">{remate.title}</span>
          </div>
          <h1 className="max-w-[20ch] text-balance text-4xl font-semibold leading-[1.02] tracking-tight sm:text-6xl">{headline}</h1>
          <p className="max-w-[56ch] text-lg text-ink-muted">
            {!isStructureEditable
              ? 'El remate ya empezó: podés revisar los lotes, pero no agregar, editar ni reordenar.'
              : isDraft
                ? canPublish
                  ? `${lotes.length} ${lotes.length === 1 ? 'lote cargado' : 'lotes cargados'}. Revisá el orden de salida y publicá cuando quieras.`
                  : 'Completá lo que falta y después publicalo para que los compradores lo vean.'
                : 'Podés seguir ajustando los lotes hasta que empiece el remate.'}
          </p>
          <dl className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-ink-muted">
            <div className="flex items-center gap-1.5">
              <dt className="sr-only">Modalidad</dt>
              {timed ? <Timer aria-hidden="true" className="h-3.5 w-3.5" /> : <Radio aria-hidden="true" className="h-3.5 w-3.5" />}
              <dd>{timed ? 'Timed Auction' : 'En vivo con rematador'}</dd>
            </div>
            <div className="flex items-center gap-1.5">
              <dt className="sr-only">Acceso</dt>
              {remate.access_type === 'private' ? <Lock aria-hidden="true" className="h-3.5 w-3.5" /> : <Globe aria-hidden="true" className="h-3.5 w-3.5" />}
              <dd>{remate.access_type === 'private' ? 'Privado' : 'Público'}</dd>
            </div>
            <div className="flex items-center gap-1.5">
              <dt className="sr-only">Fecha</dt>
              <Calendar aria-hidden="true" className="h-3.5 w-3.5" />
              <dd>{remate.starts_at ? formatDateTime(remate.starts_at) : 'Sin fecha'}</dd>
            </div>
            <div className="flex items-center gap-1.5">
              <dt className="sr-only">Garantía</dt>
              <ShieldCheck aria-hidden="true" className="h-3.5 w-3.5" />
              <dd>{guaranteeAmount ? `Garantía ${new Intl.NumberFormat('es-AR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(Number(guaranteeAmount))}` : 'Sin garantía'}</dd>
            </div>
            <div className="flex items-center gap-1.5">
              <dt className="sr-only">Moneda</dt>
              <dd>{currency}</dd>
            </div>
          </dl>

          <div className="flex flex-wrap items-center gap-3">
            <div ref={heroPublishRef}>
              {isDraft ? (
                <Button
                  variant="hero"
                  onClick={handlePublish}
                  isLoading={isPublishing}
                  disabled={!canPublish}
                  aria-describedby={!canPublish ? 'publish-why' : undefined}
                  className="px-7 py-3.5 text-[15px]"
                >
                  <SendIcon className="h-[18px] w-[18px]" />
                  Publicar remate
                </Button>
              ) : (
                <Link
                  to={`/remates/${id}`}
                  className="inline-flex items-center gap-2 rounded-full border border-line-strong bg-white px-7 py-3.5 text-[15px] font-semibold transition-colors hover:border-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
                >
                  <Eye aria-hidden="true" className="h-[18px] w-[18px]" />
                  Ver como comprador
                </Link>
              )}
            </div>
            {isStructureEditable && (
              <Button variant="secondary" onClick={addLote} className="rounded-full px-7 py-3.5 text-[15px]">
                <Plus aria-hidden="true" className="h-[18px] w-[18px]" />
                Agregar lote
              </Button>
            )}
            <RemateSettingsMenu
              remate={remate}
              onEdit={() => setIsRemateModalOpen(true)}
              onCancel={() => setIsCancelModalOpen(true)}
              onDelete={() => setIsDeleteRemateModalOpen(true)}
              onDuplicate={handleDuplicateRemate}
              onViewAudit={() => navigate(`/remates/${id}/auditoria`)}
              isDuplicating={isDuplicatingRemate}
            />
          </div>
          {isDraft && (
            <p id="publish-why" className={`text-sm ${canPublish ? 'text-ink-muted' : 'font-semibold text-danger-600'}`}>
              {canPublish ? 'Los compradores lo ven apenas lo publiques.' : preparation.blockedReason}
            </p>
          )}
        </header>

        {!isStructureEditable && (
          <div className="mt-8">
            <Alert variant="info">
              La estructura de lotes está congelada porque el remate ya está{' '}
              {remate.status === 'live' || remate.status === 'paused' ? 'en vivo' : 'finalizado o cancelado'}.
            </Alert>
          </div>
        )}

        {isDraft && (
          <section aria-labelledby="checklist-title" className="mt-14">
            <SectionHeading id="checklist-title" title="Antes de publicar" description="Lo obligatorio para publicar y lo recomendado para que el remate se vea bien." />
            <PreparationChecklist items={preparation.items} onAction={handleChecklistAction} />
          </section>
        )}

        {hasLotes && (
          <section aria-labelledby="numbers-title" className="mt-20">
            <SectionHeading id="numbers-title" title="Tu catálogo en números" description="Un vistazo a lo que cargaste hasta ahora." />
            <CatalogNumbers lotes={lotes} currency={currency} onSelectLote={scrollToLote} />
          </section>
        )}

        <section aria-labelledby="lotes-title" className="mt-20">
          <SectionHeading
            id="lotes-title"
            title="Tus lotes"
            description={
              isStructureEditable
                ? 'El orden de la galería es el orden de salida. Arrastrá un lote o usá su menú para moverlo.'
                : 'Solo lectura mientras el remate está en curso.'
            }
          />

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
            <div className={GRID_CLASSES}>
              {Array.from({ length: LOTE_SKELETON_COUNT }, (_, index) => (
                <LoteManagementCardSkeleton key={index} />
              ))}
            </div>
          )}

          {!isLotesLoading && !lotesError && lotes.length === 0 && (
            <div className="grid justify-items-center gap-3 rounded-3xl border border-dashed border-line-strong px-6 py-16 text-center">
              <h3 className="text-2xl font-semibold tracking-tight">Aún no agregaste ningún lote</h3>
              <p className="max-w-[48ch] text-ink-muted">
                Un lote es lo que se vende en el remate: un grupo de animales, una máquina, un inmueble. Cargá el primero en tres pasos:
                fotos, datos y precios.
              </p>
              {isStructureEditable && (
                <Button variant="hero" onClick={addLote} className="mt-2 px-6 py-3">
                  <Plus aria-hidden="true" className="h-4 w-4" />
                  Crear primer lote
                </Button>
              )}
            </div>
          )}

          {hasLotes && (
            <>
              <div className="mb-8 flex flex-wrap items-center gap-x-4 gap-y-3">
                <div role="group" aria-label="Filtrar lotes" className="flex flex-wrap gap-1.5">
                  {FILTERS.map((option) => {
                    const count = filterLotes(lotes, option.value, '').length;
                    const isActive = filter === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        aria-pressed={isActive}
                        onClick={() => setFilter(option.value)}
                        className={`rounded-full border px-4 py-2 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                          isActive ? 'border-ink bg-ink text-white' : 'border-line bg-white text-ink-muted hover:border-ink hover:text-ink'
                        }`}
                      >
                        {option.label}
                        <span className="ml-1.5 font-medium tabular-nums opacity-65">{count}</span>
                      </button>
                    );
                  })}
                </div>
                <div role="group" aria-label="Vista" className="inline-flex rounded-full border border-line bg-surface-subtle p-0.5">
                  {(
                    [
                      { value: 'grid', label: 'Galería', icon: LayoutGrid },
                      { value: 'list', label: 'Orden de salida', icon: List },
                    ] as const
                  ).map(({ value, label, icon: Icon }) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={view === value}
                      onClick={() => setView(value)}
                      className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                        view === value ? 'bg-ink text-white' : 'text-ink-muted hover:text-ink'
                      }`}
                    >
                      <Icon aria-hidden="true" className="h-4 w-4" />
                      {label}
                    </button>
                  ))}
                </div>
                <label className="relative ml-auto w-full sm:w-56">
                  <span className="sr-only">Buscar lote</span>
                  <Search aria-hidden="true" className="pointer-events-none absolute left-0 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Buscar lote"
                    className="w-full border-0 border-b border-line-strong bg-transparent py-2 pl-6 pr-1 text-sm text-ink placeholder:text-ink-faint focus:border-ink focus:outline-none"
                  />
                </label>
              </div>

              {view === 'grid' ? (
                <div className={GRID_CLASSES}>
                  {isStructureEditable && filter === 'all' && searchQuery.trim() === '' && (
                    <button
                      type="button"
                      onClick={addLote}
                      className="group flex min-h-[20rem] flex-col items-center justify-center gap-3 rounded-2xl border-[1.5px] border-dashed border-line-strong bg-white p-6 text-center transition-colors hover:border-brand-600 hover:bg-brand-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                    >
                      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-ink text-white">
                        <Plus aria-hidden="true" className="h-6 w-6 transition-transform duration-200 group-hover:rotate-90" />
                      </span>
                      <span className="text-xl font-semibold tracking-tight">Agregar lote</span>
                      <span className="max-w-[26ch] text-sm text-ink-muted">Fotos, datos y precios, con vista previa para el comprador.</span>
                    </button>
                  )}
                  {filteredLotes.map((lote) => {
                    const index = lotes.findIndex((l) => l.id === lote.id);
                    return (
                      <LoteCatalogCard
                        key={lote.id}
                        lote={lote}
                        currency={currency}
                        position={index + 1}
                        total={lotes.length}
                        isEditable={isStructureEditable}
                        isNew={newLoteId === lote.id}
                        onOpen={() => setDrawerState({ mode: 'edit', lote })}
                        onDuplicate={() => void handleDuplicateLote(lote)}
                        onDelete={() => setDeletingLote(lote)}
                        onMoveBefore={() => moveLote(lote.id, -1)}
                        onMoveAfter={() => moveLote(lote.id, 1)}
                        {...dragProps(lote)}
                      />
                    );
                  })}
                </div>
              ) : (
                <ul className="border-t border-ink">
                  {filteredLotes.map((lote) => {
                    const index = lotes.findIndex((l) => l.id === lote.id);
                    return (
                      <LoteOrderRow
                        key={lote.id}
                        lote={lote}
                        currency={currency}
                        position={index + 1}
                        total={lotes.length}
                        isEditable={isStructureEditable}
                        isNew={newLoteId === lote.id}
                        onOpen={() => setDrawerState({ mode: 'edit', lote })}
                        onMoveUp={() => moveLote(lote.id, -1)}
                        onMoveDown={() => moveLote(lote.id, 1)}
                        {...dragProps(lote)}
                      />
                    );
                  })}
                </ul>
              )}

              {filteredLotes.length === 0 && (
                <div className="mt-2 grid justify-items-start gap-3">
                  <p className="text-lg font-semibold">No encontramos lotes que coincidan</p>
                  <p className="text-ink-muted">
                    {searchQuery.trim() ? `Ningún lote coincide con “${searchQuery}”.` : 'No hay lotes con ese filtro.'}
                  </p>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setFilter('all');
                      setSearchQuery('');
                    }}
                  >
                    Limpiar filtros
                  </Button>
                </div>
              )}
            </>
          )}
        </section>
      </div>

      <RemateFormModal isOpen={isRemateModalOpen} onClose={() => setIsRemateModalOpen(false)} remate={remate} onSaved={() => reloadRemate()} />

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

      <LoteDrawer
        isOpen={drawerState !== null}
        onClose={closeDrawer}
        remateId={id}
        currency={currency}
        lote={drawerState?.mode === 'edit' ? drawerState.lote : undefined}
        readOnly={!isStructureEditable}
        existingLotNumbers={lotes.map((lote) => lote.lot_number)}
        onSaved={(saved, isNew) => {
          if (isNew) markAsNew(saved.id);
          reloadLotes();
        }}
      />

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
        <div
          className={`fixed bottom-4 right-4 z-30 flex w-[min(30rem,calc(100vw-2rem))] items-center gap-4 rounded-3xl border border-line bg-white/95 p-3 pl-5 shadow-[0_24px_50px_-16px_rgba(16,17,20,0.35)] backdrop-blur-md transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] max-sm:bottom-3 ${
            showStickyPublish ? 'translate-y-0' : 'pointer-events-none translate-y-[160%]'
          }`}
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
          aria-hidden={!showStickyPublish}
        >
          <span className={`flex-1 text-sm ${canPublish ? 'text-ink-muted' : 'font-semibold text-danger-600'}`}>
            {canPublish ? 'Todo listo para publicar.' : 'Completá lo que falta para publicar.'}
          </span>
          <Button variant="hero" onClick={handlePublish} isLoading={isPublishing} disabled={!canPublish} tabIndex={showStickyPublish ? 0 : -1}>
            <SendIcon className="h-4 w-4" />
            Publicar remate
          </Button>
        </div>
      )}

      <RematePublicadoOverlay isOpen={isPublishedOverlayOpen} onDone={() => navigate('/', { state: { highlightRemateId: id } })} />
    </div>
  );
}
