import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useBreadcrumb } from '../../../app/layouts/useBreadcrumb';
import { useWideLayout } from '../../../app/layouts/useWideLayout';
import { Alert } from '../../../shared/components/Alert';
import type { BreadcrumbItem } from '../../../shared/components/Breadcrumb';
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
    <div className="flex flex-col gap-4">
      <Skeleton className="h-24 w-full rounded-xl" />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_380px]">
        <div className="flex flex-col gap-4">
          <Skeleton className="aspect-video w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
      <Skeleton className="h-40 w-full rounded-xl" />
    </div>
  );
}

/**
 * Sala del remate (Épica 4, Módulo 4.5 + 4.6; rediseñada en la Épica 9, Etapa 4 -- la
 * pantalla más importante del sistema según el enunciado). La sala arranca con el
 * Snapshot Service (`useRemateSnapshot`, vía HTTP, sin cambios) y a partir de acá se
 * mantiene actualizada por WebSocket (`useLiveRemateState`, Módulo 4.6): eventos de
 * dominio (`lote.opened`, `oferta.accepted`, etc.) actualizan únicamente la parte de la
 * pantalla que corresponde, sin recargar nada. Ver
 * docs/28-websocket-tiempo-real-sala.md para el flujo completo.
 *
 * Layout nuevo (Épica 9, Etapa 4): `useWideLayout()` le pide a `AppLayout` un `<main>`
 * más ancho (sin esto, el sidebar de ofertas+chat no entra cómodo junto al lote). Desde
 * `xl:` (1280px), grid de dos columnas -- lote activo a la izquierda (la información
 * que hace falta ver/hacer ahora: precio, cuenta regresiva, ofertar, todo dentro de
 * `ActiveLotePanel`) y un sidebar fijo a la derecha (`sticky`, alto de viewport) con
 * ofertas recientes arriba y chat ocupando el resto -- todo lo importante visible sin
 * scroll de la página en desktop, pedido explícito del enunciado. Por debajo de `xl:`
 * (tablet/mobile), se apila en una sola columna como ya hacía antes -- ningún
 * componente de presentación de acá para abajo (`SalaHeader`, `ActiveLotePanel`,
 * `OfferHistoryPanel`, `UpcomingLotesStrip`) sabe que existe un WebSocket, tal como
 * anticipaba `docs/27-sala-del-remate.md`, "Preparación para WebSockets".
 */
export function SalaPage() {
  const { remateId } = useParams<{ remateId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  useWideLayout();

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

  const breadcrumbItems: BreadcrumbItem[] = isSnapshotLoading
    ? []
    : snapshotError || !snapshot
      ? [{ label: 'Dashboard', to: '/' }, { label: 'Sala no disponible' }]
      : [
          { label: 'Dashboard', to: '/' },
          { label: snapshot.remate.title, to: `/remates/${snapshot.remate.id}` },
          { label: 'Sala en vivo' },
        ];
  useBreadcrumb(breadcrumbItems);

  if (isSnapshotLoading) {
    return <SalaSkeleton />;
  }

  if (snapshotError || !snapshot) {
    return (
      <div className="flex flex-col gap-6">
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
    <div className="flex flex-col gap-4">
      <SalaHeader
        remate={remate}
        connectedUsers={snapshot.connected_users}
        connectionStatus={connectionStatus}
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_380px]">
        <div className="min-w-0">
          {activeLote ? (
            <ActiveLotePanel
              remateId={remate.id}
              lote={activeLote}
              currency={currency}
              winningOffer={winningOffer}
              remateStatus={remate.status}
              viewerRole={user?.role}
            />
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
        </div>

        {/* Sidebar: ofertas + chat, siempre visibles sin scroll de página en desktop
         * (`xl:sticky` + alto de viewport) -- "Historial de ofertas" y "Chat lateral"
         * son dos pedidos separados del enunciado, así que van apiladas (no en tabs,
         * que ocultarían una mientras se ve la otra). Alturas fijas en las dos
         * (`OfferHistoryPanel` en `h-72 shrink-0`, `ChatPanel` en `flex-1`) para que
         * ninguna empuje a la otra al crecer -- antes `OfferHistoryPanel` crecía con
         * cada oferta nueva (hasta un tope interno) y de paso achicaba visualmente al
         * chat, que absorbía lo que quedaba del alto fijo del sidebar. Cada una scrollea
         * su propio contenido cuando no entra, ninguna cambia de tamaño. */}
        <div className="flex flex-col gap-4 xl:sticky xl:top-20 xl:h-[calc(100vh-7rem)]">
          <OfferHistoryPanel
            winningOffer={winningOffer}
            recentOffers={recentOffers}
            currency={currency}
            className="h-72 shrink-0"
          />
          <ChatPanel
            remateId={remate.id}
            subscribeToRealtime={subscribeToRealtime}
            currentUserId={user?.id}
            connectedUsers={snapshot.connected_users}
            canModerate={false}
            className="min-h-0 flex-1"
          />
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-slate-900">Próximos lotes</h2>
        {isUpcomingLotesLoading ? (
          <Skeleton className="h-32 w-full rounded-xl" />
        ) : (
          <UpcomingLotesStrip lotes={upcomingLotes} />
        )}
      </div>
    </div>
  );
}
