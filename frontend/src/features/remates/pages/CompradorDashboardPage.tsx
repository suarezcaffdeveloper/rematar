import { useMemo, useState } from 'react';
import { RecentActivityCard } from '../../notifications/components/RecentActivityCard';
import { useMisCompras } from '../../postauction/hooks';
import { Alert } from '../../../shared/components/Alert';
import { Button } from '../../../shared/components/Button';
import { EmptyState } from '../../../shared/components/EmptyState';
import { StatCard } from '../../../shared/components/StatCard';
import { DashboardToolbar } from '../components/DashboardToolbar';
import { GavelIcon } from '../components/icons';
import { RemateCard } from '../components/RemateCard';
import { RemateCardSkeleton } from '../components/RemateCardSkeleton';
import { DEFAULT_FILTERS, filterAndSortRemates } from '../filtering';
import { useRemates } from '../hooks';

const SKELETON_COUNT = 6;
const WON_LOTES_PAGE_SIZE = 1;

/**
 * Dashboard del comprador (Épica 4, Módulo 4.3; ampliado en la Épica 9, Etapa 3 --
 * rediseño) -- punto de entrada al sistema para cualquier usuario con rol `comprador`.
 * Carga toda la lista de remates visible para el usuario actual una sola vez
 * (`useRemates`) y filtra/ordena/busca client-side sobre esa lista
 * (`filterAndSortRemates`, ver docs/25-dashboard-comprador.md sobre por qué: el
 * backend no expone búsqueda de texto). El backend ya excluye `draft` para cualquiera
 * que no sea dueño/admin (`RemateService._is_visible`), así que todo lo que llega acá es
 * seguro de mostrar tal cual.
 *
 * Fila de KPIs nueva (Épica 9, Etapa 3): "Próximos remates"/"Remates en vivo" se
 * calculan sobre la misma lista ya cargada, sin pedido nuevo; "Lotes ganados" pide
 * `useMisCompras` con `page_size=1` solo para leer `data.total` (mismo dato que ya
 * expone `/mis-compras`, sin duplicar lógica de negocio). "Historial" no es una
 * sección aparte acá: el backend prohíbe explícitamente `/historial` para el rol
 * `comprador` (`HistoryService.list_finished`, 403 -- ver docs/37); el historial de un
 * comprador es, en los hechos, "Mis compras", así que ambos bullets del enunciado
 * convergen en el mismo botón/KPI en vez de fabricar una segunda vista sobre el mismo
 * dato. "Notificaciones"/"Actividad reciente" tampoco son dos fuentes distintas: el
 * backend no expone un feed de auditoría agregado por usuario (solo por remate puntual
 * o global-admin), así que `RecentActivityCard` (Notification Service, Épica 7.5)
 * cubre ambos pedidos con la misma lista.
 */
export function CompradorDashboardPage() {
  const { remates, isLoading, error, reload } = useRemates();
  const { data: misCompras } = useMisCompras(1, WON_LOTES_PAGE_SIZE);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);

  const filteredRemates = useMemo(() => filterAndSortRemates(remates, filters), [remates, filters]);

  const hasAnyRemates = remates.length > 0;
  const proximosRemates = useMemo(() => remates.filter((remate) => remate.status === 'scheduled').length, [remates]);
  const rematesEnVivo = useMemo(
    () => remates.filter((remate) => remate.status === 'live' || remate.status === 'paused').length,
    [remates],
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Remates disponibles</h1>
        <p className="mt-1 text-sm text-slate-500">
          Explorá los remates en vivo y programados a los que podés sumarte.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Próximos remates" value={proximosRemates} formattedValue={String(proximosRemates)} showTrend={false} />
        <StatCard label="Remates en vivo" value={rematesEnVivo} formattedValue={String(rematesEnVivo)} showTrend={false} />
        <StatCard
          label="Lotes ganados"
          value={misCompras?.total ?? 0}
          formattedValue={String(misCompras?.total ?? 0)}
          showTrend={false}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <DashboardToolbar filters={filters} onChange={setFilters} />

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
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: SKELETON_COUNT }, (_, index) => (
                <RemateCardSkeleton key={index} />
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
              title="Todavía no hay remates disponibles"
              description="Cuando un rematador programe un remate, vas a poder verlo acá."
            />
          )}

          {!isLoading && !error && filteredRemates.length > 0 && (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {filteredRemates.map((remate) => (
                <RemateCard key={remate.id} remate={remate} />
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-6">
          <RecentActivityCard />
        </div>
      </div>
    </div>
  );
}
