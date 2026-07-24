import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useBreadcrumb } from '../../../app/layouts/useBreadcrumb';
import { useWideLayout } from '../../../app/layouts/useWideLayout';
import { Alert } from '../../../shared/components/Alert';
import type { BreadcrumbItem } from '../../../shared/components/Breadcrumb';
import { Button } from '../../../shared/components/Button';
import { EmptyState } from '../../../shared/components/EmptyState';
import { Skeleton } from '../../../shared/components/Skeleton';
import { AnalyticsPanel } from '../../analytics/components/AnalyticsPanel';
import { useAuth } from '../../auth/hooks';
import { useLiveRemateState } from '../../sala/hooks';
import { GavelIcon } from '../../remates/components/icons';
import type { RemateStatus } from '../../remates/types';
import { ConsolaControlPanel } from '../components/ConsolaControlPanel';
import { ConsolaHeader } from '../components/ConsolaHeader';
import { ConsolaLotePanel } from '../components/ConsolaLotePanel';
import { ConsolaSidebar } from '../components/ConsolaSidebar';
import { ConsolaUpcomingLotesPanel } from '../components/ConsolaUpcomingLotesPanel';

const NOT_OPERATIONAL_MESSAGES: Partial<Record<RemateStatus, string>> = {
  draft: 'El remate todavía está en borrador. Programalo desde el dashboard antes de operarlo acá.',
  scheduled: 'El remate todavía no empezó. Iniciálo desde el dashboard para acceder a la consola operativa.',
  finished: 'Este remate ya finalizó. No queda ninguna operación pendiente.',
  cancelled: 'Este remate fue cancelado.',
};

function ConsolaSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-24 w-full rounded-xl" />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_380px]">
        <div className="flex flex-col gap-4">
          <Skeleton className="aspect-video w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
      <Skeleton className="h-32 w-full rounded-xl" />
    </div>
  );
}

/**
 * Consola Operativa del Rematador (Épica 5, Módulo 5.2; rediseñada en la Épica 9,
 * Etapa 5). Reusa `useLiveRemateState` de `features/sala/hooks.ts` tal cual (Épica 4.6,
 * sin modificarlo): mismo snapshot inicial + reconciliación por WebSocket + eventos
 * incrementales que ya usa la Sala del comprador -- la consola es, en los hechos, una
 * segunda conexión a la misma sala, viendo exactamente los mismos eventos en tiempo
 * real. Ver docs/30-consola-operativa-rematador.md para el flujo completo.
 *
 * Layout nuevo (Épica 9, Etapa 5): mismo patrón que la Sala del comprador (Etapa 4) --
 * `useWideLayout()` + grid `xl:grid-cols-[1fr_380px]`. Antes era un apilado de 5-6
 * cards a lo ancho completo (lote+ofertas en grid, próximos lotes, chat, moderación,
 * analítica); un rematador tenía que hacer scroll más allá del chat y la moderación
 * para llegar a la analítica, y el panel de control quedaba a un scroll de la cabecera.
 * Ahora: columna principal con lote activo + panel de control (lo que hace falta ver/
 * operar todo el tiempo) + analítica más abajo; `ConsolaSidebar` (`sticky`, alto de
 * viewport) con pestañas Chat/Ofertas/Conectados/Moderación -- a diferencia de la Sala
 * (que apila Chat+Ofertas sin pestañas, son solo dos), acá son cuatro secciones y la
 * mayoría de uso ocasional, así que pestañas evitan que cuatro paneles compitan por el
 * mismo espacio angosto sin agregar un scroll de página.
 *
 * Reemplaza la ruta `/remates/:remateId/gestionar` que hasta ahora mostraba
 * `GestionRematePlaceholderPage` (Épica 5.1) -- mismo patrón que la Sala reemplazó su
 * propio placeholder entre los Módulos 4.4 y 4.5, sin tocar el árbol de rutas.
 */
export function ConsolaOperativaPage() {
  const { remateId } = useParams<{ remateId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  useWideLayout();

  const {
    snapshot,
    isLoading,
    error,
    reload,
    upcomingLotes,
    connectionStatus,
    subscribeToRealtime,
  } = useLiveRemateState(remateId ?? '');

  const [selectedLoteId, setSelectedLoteId] = useState<string | null>(null);

  // Si el lote seleccionado deja de estar "pending" (se abrió, se canceló, o
  // simplemente ya no está en la tanda de próximos lotes), la selección deja de tener
  // sentido -- se limpia sola en vez de apuntar a un lote que ya no corresponde.
  useEffect(() => {
    if (selectedLoteId && !upcomingLotes.some((lote) => lote.id === selectedLoteId)) {
      setSelectedLoteId(null);
    }
  }, [upcomingLotes, selectedLoteId]);

  const hasUpcomingLotes = upcomingLotes.length > 0;

  const breadcrumbItems: BreadcrumbItem[] = isLoading
    ? []
    : error || !snapshot
      ? [{ label: 'Mis remates', to: '/' }, { label: 'Consola no disponible' }]
      : [{ label: 'Mis remates', to: '/' }, { label: snapshot.remate.title }];
  useBreadcrumb(breadcrumbItems);

  if (isLoading) {
    return <ConsolaSkeleton />;
  }

  if (error || !snapshot) {
    return (
      <div className="flex flex-col gap-6">
        <Alert variant="error">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{error?.message ?? 'No se pudo cargar la consola de este remate.'}</span>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={reload}>
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

  const {
    remate,
    active_lote: activeLote,
    winning_offer: winningOffer,
    recent_offers: recentOffers,
    connected_users: connectedUsers,
  } = snapshot;
  const currency = remate.settings.currency;
  const isOperational = remate.status === 'live' || remate.status === 'paused';

  return (
    <div className="flex flex-col gap-4">
      <ConsolaHeader remate={remate} connectedUsers={connectedUsers} connectionStatus={connectionStatus} />

      {!isOperational ? (
        <EmptyState
          icon={<GavelIcon className="h-10 w-10" />}
          title="Esta consola es para remates en vivo"
          description={NOT_OPERATIONAL_MESSAGES[remate.status]}
          action={
            <Button variant="secondary" onClick={() => navigate('/')}>
              Volver al dashboard
            </Button>
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_380px]">
            <div className="flex min-w-0 flex-col gap-4">
              <ConsolaLotePanel
                activeLote={activeLote}
                currency={currency}
                winningOffer={winningOffer}
                hasUpcomingLotes={hasUpcomingLotes}
              />
              <ConsolaControlPanel
                remate={remate}
                activeLote={activeLote}
                selectedLoteId={selectedLoteId}
                hasUpcomingLotes={hasUpcomingLotes}
              />
            </div>

            <ConsolaSidebar
              remateId={remate.id}
              subscribeToRealtime={subscribeToRealtime}
              currentUserId={user?.id}
              connectedUsers={connectedUsers}
              winningOffer={winningOffer}
              recentOffers={recentOffers}
              currency={currency}
            />
          </div>

          <div className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold text-slate-900">Próximos lotes</h2>
            <ConsolaUpcomingLotesPanel
              lotes={upcomingLotes}
              selectedLoteId={selectedLoteId}
              onSelect={setSelectedLoteId}
              selectionEnabled={remate.status === 'live' && !activeLote}
            />
          </div>

          <AnalyticsPanel remateId={remate.id} subscribeToRealtime={subscribeToRealtime} currency={currency} />
        </>
      )}
    </div>
  );
}
