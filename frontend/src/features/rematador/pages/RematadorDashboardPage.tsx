import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/hooks';
import { RecentActivityCard } from '../../notifications/components/RecentActivityCard';
import { Alert } from '../../../shared/components/Alert';
import { Button } from '../../../shared/components/Button';
import { EmptyState } from '../../../shared/components/EmptyState';
import { StatCard } from '../../../shared/components/StatCard';
import { DashboardToolbar } from '../../remates/components/DashboardToolbar';
import { GavelIcon } from '../../remates/components/icons';
import { DEFAULT_FILTERS, filterAndSortRemates } from '../../remates/filtering';
import { useRemates } from '../../remates/hooks';
import { ALL_STATUS_OPTIONS } from '../../remates/labels';
import { PlusIcon } from '../components/icons';
import { RemateFormModal } from '../components/RemateFormModal';
import { RematadorDashboardStats } from '../components/RematadorDashboardStats';
import { RematadorRemateCard } from '../components/RematadorRemateCard';
import { RematadorRemateCardSkeleton } from '../components/RematadorRemateCardSkeleton';
import { useLiveOperationalSummary } from '../hooks';

const SKELETON_COUNT = 6;

/**
 * Dashboard del Rematador (Épica 5, Módulo 5.1; ampliado en la Épica 9, Etapa 3 --
 * rediseño) -- consola de operación de los remates propios del usuario autenticado.
 * Reusa toda la infraestructura ya construida para el dashboard del comprador (Épica
 * 4.3: `useRemates`, `filterAndSortRemates`, `DashboardToolbar`) en vez de duplicarla;
 * lo único nuevo es *qué* trae (`owner_id`, incluye `draft`) y *cómo* se presenta cada
 * tarjeta (datos operativos + acciones de ciclo de vida, ver `RematadorRemateCard`).
 * Ver docs/29-dashboard-rematador.md.
 *
 * Fila de resumen en vivo nueva (Épica 9, Etapa 3): "Lotes abiertos"/"Compradores
 * conectados" se agregan a través de todos los remates en `live` vía
 * `useLiveOperationalSummary` (un `GET .../snapshot` en paralelo por remate en vivo,
 * mismo endpoint que ya usa cada `RematadorRemateCard` para su propio "conectados").
 * Deliberadamente no es un feed de "ofertas en tiempo real" por WebSocket -- sostener
 * N conexiones simultáneas (una por remate en vivo) solo para esta fila de resumen es
 * un cambio de arquitectura mayor al alcance puramente visual de esta etapa; para eso
 * ya existe la Consola Operativa de cada remate puntual. "Accesos rápidos" ya estaba
 * cubierto por los tres botones del header (Ventas adjudicadas/Historial/Crear
 * remate) -- no se duplica como sección aparte. "Actividad reciente" reusa
 * `RecentActivityCard` (Notification Service, mismo componente que el dashboard del
 * comprador).
 */
export function RematadorDashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { remates, isLoading, error, reload } = useRemates({ ownerId: user?.id ?? '' });
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const filteredRemates = useMemo(() => filterAndSortRemates(remates, filters), [remates, filters]);
  const hasAnyRemates = remates.length > 0;

  const liveRemateIds = useMemo(
    () => remates.filter((remate) => remate.status === 'live').map((remate) => remate.id),
    [remates],
  );
  const { data: liveSummary } = useLiveOperationalSummary(liveRemateIds);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Mis remates</h1>
          <p className="mt-1 text-sm text-slate-500">
            Administrá tus remates: creá, preparalos, iniciá, reanudá y finalizá desde acá.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => navigate('/ventas-adjudicadas')}>
            Ventas adjudicadas
          </Button>
          <Button variant="secondary" onClick={() => navigate('/historial')}>
            Ver historial
          </Button>
          <Button onClick={() => setIsCreateModalOpen(true)}>
            <PlusIcon className="h-4 w-4" />
            Crear remate
          </Button>
        </div>
      </div>

      {!isLoading && !error && <RematadorDashboardStats remates={remates} />}

      {!isLoading && !error && liveRemateIds.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <StatCard
            label="Lotes abiertos"
            value={liveSummary.openLotes}
            formattedValue={String(liveSummary.openLotes)}
            showTrend={false}
            accentClassName="bg-amber-500"
          />
          <StatCard
            label="Compradores conectados"
            value={liveSummary.connectedUsers}
            formattedValue={String(liveSummary.connectedUsers)}
            showTrend={false}
            accentClassName="bg-brand-500"
          />
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <DashboardToolbar filters={filters} onChange={setFilters} statusOptions={ALL_STATUS_OPTIONS} />

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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
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
                <Button variant="secondary" onClick={() => setFilters(DEFAULT_FILTERS)}>
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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filteredRemates.map((remate) => (
                <RematadorRemateCard key={remate.id} remate={remate} onChanged={reload} />
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-6">
          <RecentActivityCard />
        </div>
      </div>

      <RemateFormModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSaved={(created) => {
          reload();
          navigate(`/remates/${created.id}/lotes`);
        }}
      />
    </div>
  );
}
