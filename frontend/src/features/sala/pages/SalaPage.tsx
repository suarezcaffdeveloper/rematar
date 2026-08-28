import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useFocusMode } from '../../../app/layouts/useFocusMode';
import { useWideLayout } from '../../../app/layouts/useWideLayout';
import { Alert } from '../../../shared/components/Alert';
import { Button } from '../../../shared/components/Button';
import { EmptyState } from '../../../shared/components/EmptyState';
import { Skeleton } from '../../../shared/components/Skeleton';
import { useToastStore } from '../../../shared/toast/toastStore';
import { useAuth } from '../../auth/hooks';
import { NotificationBell } from '../../notifications/components/NotificationBell';
import { GavelIcon } from '../../remates/components/icons';
import { ActiveLotePanel } from '../components/ActiveLotePanel';
import { LoteWonOverlay, type WonLoteInfo } from '../components/LoteWonOverlay';
import { SalaBidPanel } from '../components/SalaBidPanel';
import { SalaHeader } from '../components/SalaHeader';
import { SalaSidePanel } from '../components/SalaSidePanel';
import { UpcomingLotesStrip } from '../components/UpcomingLotesStrip';
import { useLiveRemateState } from '../hooks';
import { isDomainEventMessage } from '../realtime/messages';

/** Único resto visible del `Header` global una vez que `SalaPage` lo oculta vía
 * `useFocusMode(true)`. En la pantalla ya cargada la campana vive adentro de
 * `SalaHeader` (a la par del contador de conectados, ver el prop `notifications`) --
 * esta burbuja flotante solo cubre los estados que no llegan a renderizar `SalaHeader`
 * (esqueleto de carga, error), donde igual tiene que quedar accesible. */
function FloatingNotificationBell() {
  const { isAuthenticated } = useAuth();
  // Visitante anónimo (ADR-049): sin sesión no hay notificaciones que pedir -- montar
  // igual dispararía un 401 contra un endpoint autenticado.
  if (!isAuthenticated) return null;
  return (
    <div className="flex justify-end">
      <div className="rounded-full border border-slate-200 bg-white p-1 shadow-sm">
        <NotificationBell />
      </div>
    </div>
  );
}

function SalaSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-[85rem] flex-col gap-4 font-display">
      <FloatingNotificationBell />
      <Skeleton className="h-16 w-full rounded-lg" />
      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[1fr_380px]">
        <div className="flex flex-col gap-4">
          <Skeleton className="aspect-video w-full rounded-xl" />
          <Skeleton className="h-6 w-2/3 rounded-md" />
          <Skeleton className="h-16 w-full rounded-md" />
        </div>
        <div className="flex flex-col gap-4">
          <Skeleton className="h-24 w-full rounded-md" />
          <Skeleton className="h-32 w-full rounded-md" />
          <Skeleton className="h-64 w-full rounded-md" />
        </div>
      </div>
      <Skeleton className="h-32 w-full rounded-xl" />
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
 * Layout (Épica 9, Etapa 4; recompuesto en el rediseño visual -- ver prototipo
 * aprobado): `useWideLayout()` le pide a `AppLayout` un `<main>` más ancho (sin esto, el
 * sidebar de ofertar+historial+chat no entra cómodo junto al lote). Desde `xl:`
 * (1280px), grid de dos columnas -- identidad del lote a la izquierda
 * (`ActiveLotePanel`: imagen/título/descripción) y un sidebar fijo a la derecha
 * (`sticky`, alto de viewport) con precio + ofertar (`SalaBidPanel`, solo con lote
 * activo) arriba e historial/chat con pestañas (`SalaSidePanel`) ocupando el resto --
 * todo lo importante visible sin scroll de la página en desktop, pedido explícito del
 * enunciado. Por debajo de `xl:` (tablet/mobile), se apila en una sola columna como ya
 * hacía antes -- ningún componente de presentación de acá para abajo (`SalaHeader`,
 * `ActiveLotePanel`, `SalaBidPanel`, `SalaSidePanel`, `UpcomingLotesStrip`) sabe que
 * existe un WebSocket, tal como anticipaba `docs/27-sala-del-remate.md`, "Preparación
 * para WebSockets".
 *
 * Sin navbar global (rediseño -- vista del comprador): `useFocusMode(true)`, mismo
 * mecanismo que ya usaba el "Modo Remate" de la Consola del rematador
 * (`ConsolaOperativaPage`) para ocultar el `Header` global (breadcrumb + campana) por
 * completo -- acá el pedido fue sacarlo siempre, no solo mientras el remate está en
 * vivo, así que va sin condición y antes de cualquier `return` temprano (no puede
 * llamarse un Hook condicionalmente). La campana de notificaciones sigue siendo
 * necesaria: se remonta dentro de `SalaHeader` (prop `notifications`), a la par del
 * contador de conectados -- no en una franja propia arriba, que dejaba un espacio en
 * blanco entre el borde superior de la página y el título (pedido explícito de sacarlo).
 */
export function SalaPage() {
  const { remateId } = useParams<{ remateId: string }>();
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
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

  // Cartel "ganaste el lote" (pedido explícito, comprador): el snapshot enmascara
  // siempre `buyer_id` a `null` (ADR-031, anonimato entre postores -- ver
  // `realtime/reducer.ts::toOfertaSnapshotEntry`), así que no alcanza con mirar
  // `winningOffer` para saber si el ganador es quien está mirando esta pantalla. Los
  // eventos crudos del Event Dispatcher sí traen el `buyer_id` real (`oferta.accepted`/
  // `oferta.winner_changed`, ver `realtime/events.ts`), así que acá se sigue "quién va
  // liderando" fuera del reducer -- mismo patrón que el toast de `lote.closed` de más
  // abajo -- y se compara contra `user.id` recién cuando el lote cierra vendido. Esto
  // cubre tanto el cierre manual del rematador como el automático por timer: en los dos
  // casos la oferta ganadora ya pasó por `oferta.accepted` antes del cierre, así que no
  // hace falta distinguir `lote.winner_determined` (que solo se publica en el cierre
  // automático, ver ADR-018) por separado.
  //
  // `activeLoteRef`/`currencyRef`: `lote.closed` ya limpia `active_lote` a `null` en el
  // mismo tick (`reducer.ts`), así que para el título/N° de lote/moneda del cartel hace
  // falta guardarlos aparte -- no se puede leer del `snapshot` en el momento del cierre.
  const activeLoteRef = useRef<NonNullable<typeof snapshot>['active_lote']>(null);
  const currencyRef = useRef('');
  useEffect(() => {
    activeLoteRef.current = snapshot?.active_lote ?? null;
    currencyRef.current = snapshot?.remate.settings.currency ?? '';
  }, [snapshot]);

  const leadingBuyerRef = useRef<{ loteId: string; buyerId: string } | null>(null);
  const [wonLote, setWonLote] = useState<WonLoteInfo | null>(null);
  useEffect(() => {
    return subscribeToRealtime((message) => {
      if (!isDomainEventMessage(message)) return;
      const { payload } = message;

      if (payload.event_type === 'oferta.accepted') {
        leadingBuyerRef.current = { loteId: payload.lote_id, buyerId: payload.buyer_id };
        return;
      }
      if (payload.event_type === 'oferta.winner_changed') {
        leadingBuyerRef.current = { loteId: payload.lote_id, buyerId: payload.new_buyer_id };
        return;
      }
      if (payload.event_type === 'lote.opened') {
        leadingBuyerRef.current = null;
        return;
      }
      if (payload.event_type !== 'lote.closed' || payload.outcome !== 'sold') return;

      const leading = leadingBuyerRef.current;
      if (!leading || leading.loteId !== payload.lote_id || !user?.id || leading.buyerId !== user.id) return;

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
  // actualiza el badge de estado en `SalaHeader` vía `reducer.ts`; acá solo se agrega
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
      <div className="mx-auto flex w-full max-w-[85rem] flex-col gap-6 font-display">
        <FloatingNotificationBell />
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
    <div className="mx-auto flex w-full max-w-[85rem] flex-col gap-4 font-display">
      <LoteWonOverlay wonLote={wonLote} onContinue={() => setWonLote(null)} />

      <SalaHeader
        remate={remate}
        connectedUsers={snapshot.connected_users}
        connectionStatus={connectionStatus}
        notifications={isAuthenticated ? <NotificationBell /> : null}
      />

      {/* Rediseño visual (ver prototipo aprobado): columna izquierda -- solo identidad
       * del lote (imagen/título/descripción, `ActiveLotePanel`); precio + formulario de
       * ofertar (`SalaBidPanel`) e historial/chat (`SalaSidePanel`, con pestañas) ahora
       * viven juntos en el sidebar derecho, ya no repartidos entre `ActiveLotePanel` y
       * un stack separado. `gap-14` (56px, igual que el prototipo aprobado): sin la
       * "card" de `ActiveLotePanel` que antes delimitaba visualmente la columna, hace
       * falta más aire entre columnas para que sigan leyéndose como dos bloques
       * distintos -- y de paso dejar más espacio para precio/historial/chat, en vez de
       * que la imagen ocupe todo el ancho disponible. */}
      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[1fr_380px] xl:gap-14">
        <div className="flex min-w-0 flex-col">
          {activeLote ? (
            <ActiveLotePanel lote={activeLote} />
          ) : (
            <EmptyState
              icon={<GavelIcon className="h-10 w-10" />}
              title="No hay ningún lote abierto en este momento"
              description="El martillero todavía no abrió un lote para ofertar. Volvé a intentar en unos minutos."
              action={
                <Button variant="secondary" onClick={reloadSnapshot}>
                  Actualizar
                </Button>
              }
            />
          )}
        </div>

        {/* Precio/ofertar solo con lote activo (igual que antes: `PlaceBidButton` nunca
         * se mostraba sin un lote abierto) + historial/chat, siempre visibles. Mismo
         * `top-4`/`calc(100vh-2rem)` de siempre -- tunado para el `Header` global oculto
         * acá (`useFocusMode(true)`). */}
        <div className="flex flex-col gap-6 xl:sticky xl:top-4 xl:h-[calc(100vh-2rem)]">
          {activeLote && (
            <>
              <SalaBidPanel
                remateId={remate.id}
                lote={activeLote}
                currency={currency}
                winningOffer={winningOffer}
                remateStatus={remate.status}
                viewerRole={user?.role}
              />
              <hr className="border-t border-line" />
            </>
          )}
          {/* Por debajo de `xl:` la columna no tiene alto fijo (`xl:h-[calc(100vh-2rem)]`
           * recién aplica desde ahí), así que sin un alto propio acá el panel crecía con
           * la cantidad de mensajes/ofertas que tuviera -- nada de scroll interno, y para
           * llegar a "Próximos lotes" había que scrollear todo ese alto. `h-[28rem]` fija
           * el tamaño (~6/7 mensajes de chat visibles) y deja que el scroll interno de
           * `SalaSidePanel` (`OfferHistoryList`/`ChatPanel`) haga el resto. Desde `xl:` se
           * vuelve a `h-auto` + `flex-1` para repartirse el alto fijo de la columna, tal
           * como antes. */}
          <SalaSidePanel
            recentOffers={recentOffers}
            currency={currency}
            remateId={remate.id}
            subscribeToRealtime={subscribeToRealtime}
            currentUserId={user?.id}
            connectedUsers={snapshot.connected_users}
            className="h-[28rem] min-h-0 xl:h-auto xl:flex-1"
          />
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Próximos lotes</h2>
        {isUpcomingLotesLoading ? (
          <Skeleton className="h-32 w-full rounded-xl" />
        ) : (
          <UpcomingLotesStrip lotes={upcomingLotes} />
        )}
      </div>
    </div>
  );
}
