import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Alert } from '../../../shared/components/Alert';
import { Breadcrumb } from '../../../shared/components/Breadcrumb';
import { Button } from '../../../shared/components/Button';
import { EmptyState } from '../../../shared/components/EmptyState';
import { Skeleton } from '../../../shared/components/Skeleton';
import { AnalyticsPanel } from '../../analytics/components/AnalyticsPanel';
import { useAuth } from '../../auth/hooks';
import { ChatPanel } from '../../chat/components/ChatPanel';
import { useLiveRemateState } from '../../sala/hooks';
import { GavelIcon } from '../../remates/components/icons';
import type { RemateStatus } from '../../remates/types';
import { ConnectedUsersList } from '../components/ConnectedUsersList';
import { ConsolaControlPanel } from '../components/ConsolaControlPanel';
import { ConsolaHeader } from '../components/ConsolaHeader';
import { ConsolaLotePanel } from '../components/ConsolaLotePanel';
import { ConsolaOfferPanel } from '../components/ConsolaOfferPanel';
import { ConsolaUpcomingLotesPanel } from '../components/ConsolaUpcomingLotesPanel';

const NOT_OPERATIONAL_MESSAGES: Partial<Record<RemateStatus, string>> = {
  draft: 'El remate todavía está en borrador. Programalo desde el dashboard antes de operarlo acá.',
  scheduled: 'El remate todavía no empezó. Iniciálo desde el dashboard para acceder a la consola operativa.',
  finished: 'Este remate ya finalizó. No queda ninguna operación pendiente.',
  cancelled: 'Este remate fue cancelado.',
};

function ConsolaSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-4 w-48" />
      <Skeleton className="h-24 w-full rounded-xl" />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <Skeleton className="aspect-video w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
      <Skeleton className="h-32 w-full rounded-xl" />
    </div>
  );
}

/**
 * Consola Operativa del Rematador (Épica 5, Módulo 5.2) -- la pantalla desde donde se
 * opera un remate en vivo. Reusa `useLiveRemateState` de `features/sala/hooks.ts` tal
 * cual (Épica 4.6, sin modificarlo): mismo snapshot inicial + reconciliación por
 * WebSocket + eventos incrementales que ya usa la Sala del comprador -- la consola es,
 * en los hechos, una segunda conexión a la misma sala, viendo exactamente los mismos
 * eventos en tiempo real. Ver docs/30-consola-operativa-rematador.md para el flujo
 * completo y el diagrama.
 *
 * Reemplaza la ruta `/remates/:remateId/gestionar` que hasta ahora mostraba
 * `GestionRematePlaceholderPage` (Épica 5.1) -- mismo patrón que la Sala reemplazó su
 * propio placeholder entre los Módulos 4.4 y 4.5, sin tocar el árbol de rutas.
 */
export function ConsolaOperativaPage() {
  const { remateId } = useParams<{ remateId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

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

  if (isLoading) {
    return <ConsolaSkeleton />;
  }

  if (error || !snapshot) {
    return (
      <div className="flex flex-col gap-6">
        <Breadcrumb items={[{ label: 'Mis remates', to: '/' }, { label: 'Consola no disponible' }]} />
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
    connected_users_detail: connectedUsersDetail,
  } = snapshot;
  const currency = remate.settings.currency;
  const isOperational = remate.status === 'live' || remate.status === 'paused';

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumb items={[{ label: 'Mis remates', to: '/' }, { label: remate.title }]} />

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
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <div className="flex flex-col gap-5 lg:col-span-2">
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
            <div className="flex flex-col gap-5">
              <ConsolaOfferPanel winningOffer={winningOffer} recentOffers={recentOffers} currency={currency} />
              <ConnectedUsersList connectedUsers={connectedUsersDetail} />
            </div>
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

          <ChatPanel
            remateId={remate.id}
            subscribeToRealtime={subscribeToRealtime}
            currentUserId={user?.id}
            connectedUsers={connectedUsers}
            canModerate
          />

          <AnalyticsPanel
            remateId={remate.id}
            subscribeToRealtime={subscribeToRealtime}
            currency={currency}
          />
        </>
      )}
    </div>
  );
}
