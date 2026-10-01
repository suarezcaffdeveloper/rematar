import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useFocusMode } from '../../../app/layouts/useFocusMode';
import { useTopNavLayout } from '../../../app/layouts/useTopNavLayout';
import { useWideLayout } from '../../../app/layouts/useWideLayout';
import { Alert } from '../../../shared/components/Alert';
import { Button } from '../../../shared/components/Button';
import { Skeleton } from '../../../shared/components/Skeleton';
import { useToastStore } from '../../../shared/toast/toastStore';
import { useAuth } from '../../auth/hooks';
import { ChatPanel } from '../../chat/components/ChatPanel';
import { GarantiaModal } from '../../garantias/components/GarantiaModal';
import { useGarantiaStatus } from '../../garantias/hooks';
import { TimedSalaPage } from '../../timedSala/pages/TimedSalaPage';
import { LoteWonOverlay, type WonLoteInfo } from '../components/LoteWonOverlay';
import { SalaBidPanel } from '../components/SalaBidPanel';
import { SalaLoteColumn } from '../components/SalaLoteColumn';
import { SalaMobileBidBar } from '../components/SalaMobileBidBar';
import { SalaRecentOffers } from '../components/SalaRecentOffers';
import { SalaRoomHeader } from '../components/SalaRoomHeader';
import { SalaUpcomingGrid } from '../components/SalaUpcomingGrid';
import { useLiveRemateState } from '../hooks';
import { isDomainEventMessage } from '../realtime/messages';

function SalaSkeleton() {
  return (
    <div className="font-display">
      <div className="border-b border-line px-3 pb-4 pt-6 sm:px-6 lg:px-10">
        <Skeleton className="h-10 w-2/3 max-w-2xl rounded-md" />
      </div>
      <div className="grid grid-cols-1 border-b border-line xl:grid-cols-[minmax(0,1.5fr)_minmax(23rem,1fr)_minmax(20rem,0.85fr)]">
        <div className="flex flex-col gap-4 p-4 xl:p-5">
          <Skeleton className="aspect-video w-full rounded-2xl" />
          <Skeleton className="h-6 w-2/3 rounded-md" />
          <Skeleton className="h-16 w-full rounded-md" />
        </div>
        <div className="flex flex-col gap-4 p-4 xl:border-l xl:border-line xl:p-5">
          <Skeleton className="h-24 w-full rounded-md" />
          <Skeleton className="h-32 w-full rounded-md" />
          <Skeleton className="h-40 w-full rounded-md" />
        </div>
        <div className="p-4 xl:border-l xl:border-line xl:p-5">
          <Skeleton className="h-96 w-full rounded-md" />
        </div>
      </div>
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
 * Layout ("el chat te acompaña", rediseño de la Sala en vivo): la página scrollea. Desde
 * `xl:` (1280px), grilla de tres columnas -- el lote en remate (`SalaLoteColumn`: video o
 * fotos, y de qué se trata), la mesa de ofertas (`SalaBidPanel`: precio vigente + formulario
 * de ofertar, y `SalaRecentOffers`: las ofertas recientes con la ganadora arriba) y el chat
 * (`ChatPanel`), que queda PEGADO a la pantalla con todo su alto mientras se scrollea. Los
 * próximos lotes (`SalaUpcomingGrid`) van debajo del lote y de las ofertas, ocupando el
 * ancho de esas dos columnas y chocando a la derecha con el chat. Nada queda detrás de
 * pestañas. Por debajo de `xl:` se apila y `SalaMobileBidBar` deja el precio y el atajo para
 * ofertar fijos abajo. Ningún componente de presentación de acá para abajo sabe que existe
 * un WebSocket, tal como anticipaba `docs/27-sala-del-remate.md`, "Preparación para
 * WebSockets".
 *
 * Barra superior fija (`useTopNavLayout({ staticBar: true })`): la Sala usa el mismo nav
 * del resto del comprador (`BuyerTopNav`, con la campana adentro -- ya no hace falta la
 * campana suelta que se remontaba al ocultar el `Header`), pero como barra completa al
 * principio de la página, que no sigue el scroll ni se achica: durante el remate no se
 * navega, y para salir se vuelve hacia arriba. Vale también para un remate Timed, que esta
 * página monta más abajo (`TimedSalaPage`).
 */
export function SalaPage() {
  const { remateId } = useParams<{ remateId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  useWideLayout();
  useFocusMode(true);

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

  // Barra superior fija, para las dos modalidades -- ver el docstring.
  useTopNavLayout({ staticBar: true });

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

  // Cartel "ganaste el lote" (pedido explícito, comprador): desde la remediación del
  // WebSocket Security Audit (Fase 1, `backend/app/realtime/privilege.py`) tanto el
  // snapshot (`SnapshotService._mask_oferta`) como los eventos crudos (`oferta.accepted`/
  // `oferta.winner_changed`, `MASKERS` en ese mismo módulo) enmascaran `buyer_id` por
  // destinatario dejando visible el propio id real -- así que `winningOffer.buyer_id`
  // (más abajo) ya alcanza para saber si el líder actual es quien mira esta pantalla,
  // tanto al cargar/recargar la Sala como en vivo. Antes de esa remediación no era así
  // (ver historial de este archivo) y esta pantalla llevaba su propio seguimiento
  // "reconstruible solo desde eventos en vivo" -- eso es justo lo que producía el bug
  // reportado: recargar la Sala mientras se lideraba un lote perdía el cartel de
  // "liderando" hasta la próxima oferta.
  //
  // Lo único que sigue necesitando seguimiento aparte es el cartel de "ganaste el lote":
  // `lote.closed` limpia `active_lote` (y por lo tanto oculta `winningOffer`) en el mismo
  // tick del reducer, así que hace falta capturar el líder/título/N° de lote/moneda un
  // instante antes de que eso pase -- se guarda en refs, sincronizados en cada cambio de
  // `snapshot`, y se lee en el listener de `lote.closed` de más abajo (que corre con el
  // evento crudo, antes de que el reducer aplique el cierre). Cubre tanto el cierre
  // manual del rematador como el automático por timer: en los dos casos la oferta
  // ganadora ya pasó por `oferta.accepted` antes del cierre, así que no hace falta
  // distinguir `lote.winner_determined` (que solo se publica en el cierre automático, ver
  // ADR-018) por separado.
  const activeLoteRef = useRef<NonNullable<typeof snapshot>['active_lote']>(null);
  const currencyRef = useRef('');
  const winningBuyerIdRef = useRef<string | null>(null);
  useEffect(() => {
    activeLoteRef.current = snapshot?.active_lote ?? null;
    currencyRef.current = snapshot?.remate.settings.currency ?? '';
    winningBuyerIdRef.current = snapshot?.winning_offer?.buyer_id ?? null;
  }, [snapshot]);

  const [wonLote, setWonLote] = useState<WonLoteInfo | null>(null);
  // Garantía económica (bloqueo de tarjeta vía Mercado Pago): el estado lo resuelve
  // `useGarantiaStatus` (el `GET /garantia/me` que antes hacía el `GarantiaGate`) y el
  // diálogo para constituirla lo abre el botón "Construir garantía" del propio
  // `PlaceBidButton` (pedido explícito -- ya no hay una card amarilla arriba de la
  // sala). `null` mientras el fetch inicial no resolvió, tratado igual que "sin
  // garantía activa" (`hasRequiredGuarantee` de más abajo) hasta que sí lo haga.
  const [isGarantiaModalOpen, setIsGarantiaModalOpen] = useState(false);
  const { status: garantiaStatus, reportGarantia } = useGarantiaStatus(remateId ?? '');
  useEffect(() => {
    return subscribeToRealtime((message) => {
      if (!isDomainEventMessage(message)) return;
      const { payload } = message;
      if (payload.event_type !== 'lote.closed' || payload.outcome !== 'sold') return;

      if (
        activeLoteRef.current?.id !== payload.lote_id ||
        !user?.id ||
        winningBuyerIdRef.current !== user.id
      ) {
        return;
      }

      const closingLote = activeLoteRef.current;
      setWonLote({
        lotNumber: closingLote?.lot_number ?? '',
        title: closingLote?.title ?? '',
        finalPrice: payload.final_price ?? closingLote?.base_price ?? '0',
        currency: currencyRef.current,
      });
    });
  }, [subscribeToRealtime, user?.id]);

  // Fin del remate (Módulo de lotes desiertos): el comprador no debe quedar
  // indefinidamente en una sala que ya terminó -- toast informativo y, tras una
  // pequeña transición, redirección suave al listado de remates. `remate.finished` ya
  // actualiza el badge de estado en `SalaRoomHeader` vía `reducer.ts`; acá solo se agrega
  // el aviso + la salida de la sala.
  const finishRedirectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const unsubscribe = subscribeToRealtime((message) => {
      if (!isDomainEventMessage(message) || message.payload.event_type !== 'remate.finished') return;
      useToastStore
        .getState()
        .push('info', 'El remate finalizó. Te llevamos de vuelta al inicio en unos segundos.');
      finishRedirectTimeoutRef.current = setTimeout(() => navigate('/'), 4000);
    });
    return () => {
      unsubscribe();
      if (finishRedirectTimeoutRef.current) clearTimeout(finishRedirectTimeoutRef.current);
    };
  }, [subscribeToRealtime, navigate]);

  if (isSnapshotLoading) {
    return <SalaSkeleton />;
  }

  if (snapshotError || !snapshot) {
    return (
      <div className="mx-auto flex w-full max-w-[110rem] flex-col gap-6 px-3 py-8 font-display sm:px-6 lg:px-10">
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

  // Timed Auctions: modalidad distinta, experiencia distinta (spec, sección 28 -- "no
  // reutilizar visualmente la sala de LIVE"). `TimedSalaPage` arma su propio estado
  // (`useTimedSalaState`) en vez de `useLiveRemateState`/`RemateStateSnapshot`, que
  // están armados alrededor de un único "lote activo" y no sirven para varios lotes
  // abiertos en paralelo -- ver `features/timedSala/hooks.ts`. El pedido inicial del
  // snapshot de acá arriba solo se usó para conocer la modalidad; `TimedSalaPage` pide
  // lo que necesita por su cuenta, mismo criterio "cada pantalla pide lo suyo" que ya
  // aplica el resto del proyecto.
  if (snapshot.remate.auction_type === 'timed') {
    return <TimedSalaPage />;
  }

  const { remate, active_lote: activeLote, winning_offer: winningOffer, recent_offers: recentOffers } = snapshot;
  const currency = remate.settings.currency;
  const guaranteeRequired = Boolean(remate.settings.guarantee_required);
  const guaranteeAmount = remate.settings.guarantee_amount;
  // El gate solo aplica a un comprador autenticado -- un visitante anónimo/rematador/
  // admin ya ve el botón de ofertar deshabilitado por otro motivo (rol), y el fetch de
  // la garantía daría 401 si se disparara sin sesión.
  const isGarantiaGateRelevant = guaranteeRequired && user?.role === 'comprador';
  const hasRequiredGuarantee = !guaranteeRequired || garantiaStatus === 'active';
  // Derivado directo de `winningOffer.buyer_id` (ver comentario más arriba, junto a
  // `winningBuyerIdRef`) -- se recalcula solo en cada render, así que sobrevive tanto a
  // una recarga de página como a una reconexión del WebSocket sin depender de haber
  // recibido un evento en vivo mientras la pestaña estuvo abierta.
  const isLeadingBidder = Boolean(winningOffer && user && winningOffer.buyer_id === user.id);

  return (
    <div className="min-h-screen bg-white font-display text-ink">
      <LoteWonOverlay wonLote={wonLote} onContinue={() => setWonLote(null)} />

      <SalaRoomHeader
        remate={remate}
        connectedUsers={snapshot.connected_users}
        connectionStatus={connectionStatus}
        backTo={`/remates/${remate.id}`}
      />

      {/* Diálogo de la garantía, montado una sola vez por la página y abierto desde el
       * botón "Construir garantía" del `PlaceBidButton` (ya no hay card arriba de la
       * sala que lo anuncie y lo dispare -- pedido explícito). */}
      {isGarantiaGateRelevant && guaranteeAmount && (
        <GarantiaModal
          isOpen={isGarantiaModalOpen}
          onClose={() => setIsGarantiaModalOpen(false)}
          remateId={remate.id}
          amount={guaranteeAmount}
          currency={currency}
          onResolved={reportGarantia}
        />
      )}

      {/* Tres columnas desde `xl:`: el lote, la mesa de ofertas y el chat. El chat ocupa
       * las dos filas de la grilla y su contenido queda pegado (`sticky`) al borde de la
       * pantalla mientras el resto de la página scrollea por al lado; los próximos lotes
       * ocupan la segunda fila de las dos primeras columnas. */}
      <div className="grid grid-cols-1 border-b border-line xl:grid-cols-[minmax(0,1.5fr)_minmax(23rem,1fr)_minmax(20rem,0.85fr)]">
        <SalaLoteColumn remate={remate} lote={activeLote} onReload={reloadSnapshot} />

        <section
          aria-label="Mesa de ofertas"
          className="flex flex-col bg-brand-50/40 xl:border-l xl:border-line"
        >
          {activeLote ? (
            <div className="p-4 xl:p-5">
              <SalaBidPanel
                remateId={remate.id}
                lote={activeLote}
                currency={currency}
                winningOffer={winningOffer}
                remateStatus={remate.status}
                viewerRole={user?.role}
                isLeadingBidder={isLeadingBidder}
                hasRequiredGuarantee={hasRequiredGuarantee}
                onBuildGuarantee={
                  isGarantiaGateRelevant && guaranteeAmount ? () => setIsGarantiaModalOpen(true) : undefined
                }
              />
            </div>
          ) : (
            <p className="p-4 text-ink-muted xl:p-5">
              Cuando el martillero abra un lote, el precio y el formulario para ofertar aparecen acá.
            </p>
          )}
          {activeLote && (
            <SalaRecentOffers
              recentOffers={recentOffers}
              winningOffer={winningOffer}
              currency={currency}
              currentUserId={user?.id}
            />
          )}
        </section>

        <div className="xl:col-start-3 xl:row-span-2 xl:row-start-1 xl:border-l xl:border-line">
          <section
            aria-label="Chat del remate"
            className="flex h-[32rem] min-h-0 flex-col p-4 xl:sticky xl:top-0 xl:h-screen xl:p-5 xl:pt-4"
          >
            <h2 className="mb-3 text-sm font-semibold text-ink">Chat</h2>
            <ChatPanel
              remateId={remate.id}
              subscribeToRealtime={subscribeToRealtime}
              currentUserId={user?.id}
              connectedUsers={snapshot.connected_users}
              canModerate={false}
              chrome="flat"
              className="min-h-0 flex-1"
            />
          </section>
        </div>

        <div className="border-t border-line px-4 pb-28 pt-10 xl:col-span-2 xl:col-start-1 xl:row-start-2 xl:px-5 xl:pb-16">
          <SalaUpcomingGrid lotes={upcomingLotes} isLoading={isUpcomingLotesLoading} currency={currency} />
        </div>
      </div>

      {activeLote && (
        <SalaMobileBidBar
          lote={activeLote}
          winningOffer={winningOffer}
          currency={currency}
          isLeadingBidder={isLeadingBidder}
        />
      )}
    </div>
  );
}
