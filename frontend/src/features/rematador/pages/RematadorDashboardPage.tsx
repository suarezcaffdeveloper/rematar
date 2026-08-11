import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { useAuth } from '../../auth/hooks';
import { Alert } from '../../../shared/components/Alert';
import { Button } from '../../../shared/components/Button';
import { EmptyState } from '../../../shared/components/EmptyState';
import { Pagination } from '../../../shared/components/Pagination';
import { usePagedList } from '../../../shared/hooks/usePagedList';
import { useWideLayout } from '../../../app/layouts/useWideLayout';
import { DashboardToolbar } from '../../remates/components/DashboardToolbar';
import { GavelIcon } from '../../remates/components/icons';
import { DEFAULT_FILTERS, filterAndSortRemates, type RemateFilters } from '../../remates/filtering';
import { useRemates } from '../../remates/hooks';
import { ALL_STATUS_OPTIONS } from '../../remates/labels';
import { CreateRemateButton } from '../components/CreateRemateButton';
import { RemateCreatedOverlay } from '../components/RemateCreatedOverlay';
import { RemateFormModal } from '../components/RemateFormModal';
import { RemateStartedOverlay } from '../components/RemateStartedOverlay';
import { RematadorDashboardStats } from '../components/RematadorDashboardStats';
import { RematadorRemateCard } from '../components/RematadorRemateCard';
import { RematadorRemateCardSkeleton } from '../components/RematadorRemateCardSkeleton';
import type { Remate } from '../../remates/types';

const SKELETON_COUNT = 8;
const PAGE_SIZE = 12;
const HIGHLIGHT_MS = 2000;
const CARD_GRID_CLASSES = 'grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';

interface DashboardLocationState {
  /** Seteado por `LotesManagementPage` al publicar un remate -- ver el `useEffect` más
   * abajo. Mismo patrón que `RequireAuth`/`LoginPage` (`location.state.from`), pero para
   * un resalte visual en vez de una redirección post-login. */
  highlightRemateId?: string;
}

/**
 * Dashboard del Rematador (Épica 5, Módulo 5.1; ampliado en la Épica 9, Etapa 3 --
 * rediseño; simplificado en la Épica 9, Etapa 5 -- foco en estadísticas + grilla de
 * remates propios) -- consola de operación de los remates propios del usuario
 * autenticado. Reusa toda la infraestructura ya construida para el dashboard del
 * comprador (Épica 4.3: `useRemates`, `filterAndSortRemates`, `DashboardToolbar`) en
 * vez de duplicarla; lo único nuevo es *qué* trae (`owner_id`, incluye `draft`) y *cómo*
 * se presenta cada tarjeta (datos operativos + acciones de ciclo de vida, ver
 * `RematadorRemateCard`). Ver docs/29-dashboard-rematador.md.
 *
 * "Ventas adjudicadas"/"Historial" viven en el menú lateral (`Sidebar`, por rol) -- los
 * botones que antes los duplicaban acá se sacaron para no repetir la misma navegación
 * dos veces. "Actividad reciente" se sacó para que toda la pantalla quede enfocada en
 * estadísticas + grilla de remates.
 *
 * Rediseño visual (sin cambios de datos/lógica): se sacó la fila de resumen en vivo
 * ("Lotes abiertos"/"Compradores conectados", que vivía acá vía `useLiveOperationalSummary`)
 * para que el foco quede en `RematadorDashboardStats` + la grilla de remates -- ese
 * resumen agregado seguía disponible en cada `RematadorRemateCard` ("conectados" por
 * remate) y en la Consola Operativa de cada remate puntual. `useWideLayout()` le pide a
 * `AppLayout` un `<main>` más ancho para que la grilla de 4 columnas tenga aire real en
 * pantallas grandes.
 */
export function RematadorDashboardPage() {
  useWideLayout();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { remates, isLoading, error, reload } = useRemates({ ownerId: user?.id ?? '' });
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createdRemate, setCreatedRemate] = useState<Remate | null>(null);
  const [startedRemate, setStartedRemate] = useState<Remate | null>(null);
  const [highlightedRemateId, setHighlightedRemateId] = useState<string | null>(null);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    const state = location.state as DashboardLocationState | null;
    if (!state?.highlightRemateId) return;
    setHighlightedRemateId(state.highlightRemateId);
    // Se consume una sola vez -- sin esto, volver con el botón "atrás" o refrescar la
    // página repetiría el resalte cada vez (mismo motivo por el que `LoginPage` limpia
    // `location.state.from` después de usarlo).
    navigate(location.pathname, { replace: true, state: null });
    const timer = setTimeout(() => setHighlightedRemateId(null), HIGHLIGHT_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredRemates = useMemo(() => filterAndSortRemates(remates, filters), [remates, filters]);
  const { page, totalPages, pageItems, goToPage, resetPage } = usePagedList(filteredRemates, PAGE_SIZE);
  const hasAnyRemates = remates.length > 0;

  function handleFiltersChange(next: RemateFilters) {
    setFilters(next);
    resetPage();
  }

  function handlePageChange(next: number) {
    goToPage(next);
    // Sin esto, cambiar de página deja el scroll donde estaba -- a la altura de la
    // paginación, al pie de la grilla anterior -- así que la página nueva arranca
    // invisible hasta que el usuario suba a mano.
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-6">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-sm">
            <GavelIcon className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">Mis remates</h1>
            <p className="mt-1 text-sm text-slate-500">
              Administrá tus remates: creá, preparalos, iniciá, reanudá y finalizá desde acá.
            </p>
          </div>
        </div>
        <CreateRemateButton onClick={() => setIsCreateModalOpen(true)} />
      </div>

      {!isLoading && !error && <RematadorDashboardStats remates={remates} />}

      <DashboardToolbar filters={filters} onChange={handleFiltersChange} statusOptions={ALL_STATUS_OPTIONS} />

      {error && (
        <Alert variant="error">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{error.message}</span>
            <Button variant="secondary" onClick={reload}>
              Reintentar
            </Button>
          </div>
        </Alert>
      )}

      {isLoading && !error && (
        <div className={CARD_GRID_CLASSES}>
          {Array.from({ length: SKELETON_COUNT }, (_, index) => (
            <RematadorRemateCardSkeleton key={index} />
          ))}
        </div>
      )}

      {!isLoading && !error && hasAnyRemates && filteredRemates.length === 0 && (
        <EmptyState
          icon={<GavelIcon className="h-10 w-10" />}
          title="Ningún remate coincide con tu búsqueda"
          description="Probá con otro título, o quitá alguno de los filtros aplicados."
          action={
            <Button variant="secondary" onClick={() => handleFiltersChange(DEFAULT_FILTERS)}>
              Limpiar filtros
            </Button>
          }
        />
      )}

      {!isLoading && !error && !hasAnyRemates && (
        <EmptyState
          icon={<GavelIcon className="h-10 w-10" />}
          title="Todavía no tenés remates"
          description="Creá tu primer remate para empezar a prepararlo."
          action={<Button onClick={() => setIsCreateModalOpen(true)}>Crear remate</Button>}
        />
      )}

      {!isLoading && !error && filteredRemates.length > 0 && (
        <>
          <div className={CARD_GRID_CLASSES}>
            {pageItems.map((remate, index) => (
              <motion.div
                key={remate.id}
                initial={prefersReducedMotion ? undefined : { opacity: 0, y: 16 }}
                animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: Math.min(index * 0.04, 0.32), ease: [0.21, 0.47, 0.32, 0.98] }}
              >
                <RematadorRemateCard
                  remate={remate}
                  onChanged={reload}
                  onStarted={setStartedRemate}
                  isHighlighted={remate.id === highlightedRemateId}
                />
              </motion.div>
            ))}
          </div>

          <Pagination page={page} totalPages={totalPages} onPageChange={handlePageChange} />
        </>
      )}

      <RemateFormModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSaved={(created) => {
          reload();
          setCreatedRemate(created);
        }}
      />

      <RemateCreatedOverlay
        isOpen={createdRemate !== null}
        onDone={() => {
          if (createdRemate) navigate(`/remates/${createdRemate.id}/lotes`);
        }}
      />

      {/* Vive acá, no dentro de `RematadorRemateCard` (donde estaba antes): iniciar el
          remate llama a `reload()`, que mientras la lista recarga reemplaza brevemente
          las tarjetas por esqueletos -- si el cartel/timer vivía dentro de la tarjeta, se
          desmontaba con ella y la redirección nunca llegaba a dispararse. Acá, al nivel
          de la página, sobrevive a ese vaivén. */}
      <RemateStartedOverlay
        isOpen={startedRemate !== null}
        onDone={() => {
          const target = startedRemate;
          setStartedRemate(null);
          if (target) navigate(`/remates/${target.id}/gestionar`);
        }}
      />
    </div>
  );
}
