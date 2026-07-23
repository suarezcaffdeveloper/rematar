import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Alert } from '../../../shared/components/Alert';
import { Breadcrumb } from '../../../shared/components/Breadcrumb';
import { Button } from '../../../shared/components/Button';
import { EmptyState } from '../../../shared/components/EmptyState';
import { Skeleton } from '../../../shared/components/Skeleton';
import { useToastStore } from '../../../shared/toast/toastStore';
import { useAuth } from '../../auth/hooks';
import { ChatPanel } from '../../chat/components/ChatPanel';
import { GavelIcon } from '../../remates/components/icons';
import { ActiveLotePanel } from '../components/ActiveLotePanel';
import { OfferHistoryPanel } from '../components/OfferHistoryPanel';
import { SalaHeader } from '../components/SalaHeader';
import { UpcomingLotesStrip } from '../components/UpcomingLotesStrip';
import { useLiveRemateState } from '../hooks';
import { isDomainEventMessage } from '../realtime/messages';

function SalaSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-4 w-48" />
      <Skeleton className="h-24 w-full rounded-xl" />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <Skeleton className="aspect-video w-full rounded-xl" />
          <Skeleton className="h-32 w-full rounded-xl" />
        </div>
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
      <Skeleton className="h-40 w-full rounded-xl" />
    </div>
  );
}

/**
 * Sala del remate (Épica 4, Módulo 4.5 + 4.6) -- la pantalla arranca con el Snapshot
 * Service (`useRemateSnapshot`, vía HTTP, sin cambios) y a partir de acá se mantiene
 * actualizada por WebSocket (`useLiveRemateState`, Módulo 4.6): eventos de dominio
 * (`lote.opened`, `oferta.accepted`, etc.) actualizan únicamente la parte de la
 * pantalla que corresponde, sin recargar nada. Ver
 * docs/28-websocket-tiempo-real-sala.md para el flujo completo.
 *
 * Ningún componente de presentación de acá para abajo (`SalaHeader`, `ActiveLotePanel`,
 * `OfferHistoryPanel`, `UpcomingLotesStrip`) sabe que existe un WebSocket -- siguen
 * recibiendo los mismos props ya resueltos que en la Módulo 4.5, tal como anticipaba
 * `docs/27-sala-del-remate.md`, "Preparación para WebSockets".
 */
export function SalaPage() {
  const { remateId } = useParams<{ remateId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const {
    snapshot,
    isLoading: isSnapshotLoading,
    error: snapshotError,
    reload: reloadSnapshot,
    upcomingLotes,
    isUpcomingLotesLoading,
    connectionStatus,
    subscribeToRealtime,
  } = useLiveRemateState(remateId ?? '');

  // Mensaje de adjudicación (Épica 8, "cuenta regresiva y cierre automático") -- un
  // toast, no un cambio de `active_lote` (eso ya lo resuelve `reducer.ts` en
  // `lote.closed`, que lo limpia a `null` y hace que este mismo render caiga al
  // `EmptyState` de abajo). Se escucha acá, no en el reducer (puro, sin efectos).
  useEffect(() => {
    return subscribeToRealtime((message) => {
      if (!isDomainEventMessage(message) || message.payload.event_type !== 'lote.closed') return;
      const { outcome } = message.payload;
      useToastStore
        .getState()
        .push(
          outcome === 'sold' ? 'success' : 'info',
          outcome === 'sold' ? 'El lote fue adjudicado.' : 'El lote se cerró sin ofertas.',
        );
    });
  }, [subscribeToRealtime]);

  if (isSnapshotLoading) {
    return <SalaSkeleton />;
  }

  if (snapshotError || !snapshot) {
    return (
      <div className="flex flex-col gap-6">
        <Breadcrumb items={[{ label: 'Dashboard', to: '/' }, { label: 'Sala no disponible' }]} />
        <Alert variant="error">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{snapshotError?.message ?? 'No se pudo cargar la sala de este remate.'}</span>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={reloadSnapshot}>
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

  const { remate, active_lote: activeLote, winning_offer: winningOffer, recent_offers: recentOffers } = snapshot;
  const currency = remate.settings.currency;

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumb
        items={[
          { label: 'Dashboard', to: '/' },
          { label: remate.title, to: `/remates/${remate.id}` },
          { label: 'Sala en vivo' },
        ]}
      />

      <SalaHeader
        remate={remate}
        connectedUsers={snapshot.connected_users}
        connectionStatus={connectionStatus}
      />

      {activeLote ? (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <ActiveLotePanel
              remateId={remate.id}
              lote={activeLote}
              currency={currency}
              winningOffer={winningOffer}
              remateStatus={remate.status}
              viewerRole={user?.role}
            />
          </div>
          <OfferHistoryPanel winningOffer={winningOffer} recentOffers={recentOffers} currency={currency} />
        </div>
      ) : (
        <EmptyState
          icon={<GavelIcon className="h-10 w-10" />}
          title="No hay ningún lote abierto en este momento"
          description="El rematador todavía no abrió un lote para ofertar. Volvé a intentar en unos minutos."
          action={
            <Button variant="secondary" onClick={reloadSnapshot}>
              Actualizar
            </Button>
          }
        />
      )}

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-slate-900">Próximos lotes</h2>
        {isUpcomingLotesLoading ? (
          <Skeleton className="h-32 w-full rounded-xl" />
        ) : (
          <UpcomingLotesStrip lotes={upcomingLotes} />
        )}
      </div>

      <ChatPanel
        remateId={remate.id}
        subscribeToRealtime={subscribeToRealtime}
        currentUserId={user?.id}
        connectedUsers={snapshot.connected_users}
        canModerate={false}
      />
    </div>
  );
}
