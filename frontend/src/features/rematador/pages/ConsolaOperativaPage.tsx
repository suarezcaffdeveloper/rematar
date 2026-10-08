import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ListOrdered } from 'lucide-react';
import { useBreadcrumb } from '../../../app/layouts/useBreadcrumb';
import { useFocusMode } from '../../../app/layouts/useFocusMode';
import { useWideLayout } from '../../../app/layouts/useWideLayout';
import { Alert } from '../../../shared/components/Alert';
import type { BreadcrumbItem } from '../../../shared/components/Breadcrumb';
import { Button } from '../../../shared/components/Button';
import { EmptyState } from '../../../shared/components/EmptyState';
import { Skeleton } from '../../../shared/components/Skeleton';
import { AnalyticsPanel } from '../../analytics/components/AnalyticsPanel';
import { useAuth } from '../../auth/hooks';
import { TimedConsolaPage } from '../../timedConsola/pages/TimedConsolaPage';
import { ConsolaBotsPanel } from '../../bots/components/ConsolaBotsPanel';
import { useRemateDetail } from '../../remates/hooks';
import { useLiveRemateState } from '../../sala/hooks';
import { useRemateFinishedSignal } from '../../sala/useRemateFinishedSignal';
import { GavelIcon } from '../../remates/components/icons';
import type { RemateStatus } from '../../remates/types';
import { ConsolaControlPanel } from '../components/ConsolaControlPanel';
import { ConsolaDesiertoLotesPanel } from '../components/ConsolaDesiertoLotesPanel';
import { ConsolaHeader } from '../components/ConsolaHeader';
import { ConsolaLotePanel } from '../components/ConsolaLotePanel';
import { ConsolaSidebar } from '../components/ConsolaSidebar';
import { ConsolaUpcomingLotesPanel } from '../components/ConsolaUpcomingLotesPanel';
import { EmpresaConsolaView } from '../components/empresa/EmpresaConsolaView';
import { OperatorCodeLauncher } from '../components/OperatorCodeLauncher';
import { RemateFinishedNotice } from '../components/RemateFinishedNotice';
import { PrivateAccessPanel } from '../components/PrivateAccessPanel';
import { StreamPanel } from '../components/StreamPanel';

const NOT_OPERATIONAL_MESSAGES: Partial<Record<RemateStatus, string>> = {
  draft: 'El remate todavía está en borrador. Programalo desde el dashboard antes de operarlo acá.',
  scheduled: 'El remate todavía no empezó. Iniciálo desde el dashboard para acceder a la consola operativa.',
  finished: 'No queda ninguna operación pendiente. Podés revisar el resumen completo con los resultados de cada lote.',
  cancelled: 'Este remate fue cancelado.',
};

function ConsolaSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-24 w-full rounded-xl" />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px_380px]">
        <Skeleton className="aspect-video w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
      <Skeleton className="h-32 w-full rounded-xl" />
    </div>
  );
}

/**
 * Consola Operativa del Rematador (Épica 5, Módulo 5.2; rediseñada en la Épica 9,
 * Etapa 5; y de nuevo en el rediseño a "Modo Remate"). Reusa `useLiveRemateState` de
 * `features/sala/hooks.ts` tal cual (Épica 4.6,
 * sin modificarlo): mismo snapshot inicial + reconciliación por WebSocket + eventos
 * incrementales que ya usa la Sala del comprador -- la consola es, en los hechos, una
 * segunda conexión a la misma sala, viendo exactamente los mismos eventos en tiempo
 * real. Ver docs/30-consola-operativa-rematador.md para el flujo completo.
 *
 * Layout "Modo Remate" (rediseño más reciente, sobre la base de la Épica 9, Etapa 5, y
 * de nuevo sobre la captura de referencia de Stitch/AuctionPro): mientras el remate está
 * `live`/`paused`, la página pide `useFocusMode(true)` -- `AppLayout` oculta el `Header`
 * global por completo (la verdadera "barra superior"), no solo ensancha el `<main>` (eso
 * ya lo hacía `useWideLayout`, que se mantiene para los estados no operativos). El
 * `Sidebar` global ya no se oculta en Modo Remate (pasó a ser un riel compacto que se
 * expande al hover, ver `app/layouts/Sidebar.tsx`) -- la idea del rediseño sigue siendo
 * que el rematador no tenga ninguna navegación de la app distrayendo, pero un riel
 * angosto siempre visible no compite con la consola de la forma en que lo hacía el
 * sidebar ancho de antes. `ConsolaHeader` conserva su propio botón "Salir" como acceso
 * rápido al dashboard.
 *
 * Grid principal de dos columnas reales (`xl:grid-cols-[minmax(0,1fr)_380px]`) con dos
 * filas explícitas (`xl:row-start-*`/`xl:row-span-*`, sin `grid-template-rows` propio --
 * el grid las genera solas del tamaño que pide el contenido): fila 1/columna 1 es
 * `ConsolaHeader` (título/fecha/conectados), fila 2/columna 1 es el grupo izquierdo (lote
 * activo + `ConsolaControlPanel` en un subgrid de dos columnas, y "Próximos lotes" debajo
 * ocupando ambas), y columna 2 es `ConsolaSidebar` (oferta líder + chat) ocupando las dos
 * filas (`xl:row-span-2`) -- pedido explícito: el header queda arriba de todo pero
 * angosto (del ancho del lote + la "botonera" de `ConsolaControlPanel`, no de la pantalla
 * completa), chocando a su derecha contra el sidebar, que arranca a la misma altura que el
 * header en vez de quedar empujado debajo de una franja a todo el ancho. En los estados no
 * operativos (`!isOperational`) `ConsolaHeader` no entra a este grid -- se muestra a todo
 * el ancho, arriba del `EmptyState`, como cualquier encabezado de página normal. "Próximos
 * lotes" sigue pegado contra el borde derecho del chat en vez de estirarse a todo el ancho
 * de la pantalla (pedido explícito: aprovechar el espacio en blanco que deja el chat, más
 * alto, en vez de repetir una franja a ancho completo). De la columna de `ConsolaSidebar`,
 * el bloque de ofertas recientes + pestañas (chat/conectados/moderación) queda `sticky`
 * con su alto natural (ver `ConsolaSidebar` -- el `xl:h-[calc(100vh-2rem)]` de la Sala del
 * comprador NO aplica acá: este bloque arranca debajo de la botonera, no en el tope de la
 * página, y con alto fijo de pantalla no tenía espacio para bajar): baja junto con el
 * scroll hasta que su borde superior toca el tope de la pantalla (donde estaban los
 * botones, que ya se fueron), y frena solo al llegar al final de su propia celda del grid
 * -- justo donde empieza la sección de "Analítica en tiempo real", que vive debajo del
 * grid (pedido explícito de la vista de la empresa: "la empresa debería ver eso
 * siempre... hasta que choquen con la parte de análisis"). El header y la botonera
 * "Transmisión"/"Martillero" (`ConsolaQuickPanels`, primer elemento de esa columna), en
 * cambio, ya NO son `sticky`: quedan arriba y se van con el scroll. La celda del sidebar
 * ya NO lleva `xl:self-stretch` (antes lo necesitaba la botonera sticky para tener caja de
 * sobra donde "viajar" hasta el final de la columna izquierda): ahora la caja contenida es
 * justamente lo que acota el recorrido del bloque sticky de ofertas+chat -- sin
 * `self-stretch` deja de bajar donde termina su propio contenido, no más allá. Por debajo
 * de `xl:` las clases `col-start`/`row-start`/`row-span` no aplican, así que todo cae de
 * vuelta al orden natural del DOM en una sola columna (`grid-cols-1`): header, lote +
 * control, próximos lotes, sidebar (nada sticky ahí: todas las clases nuevas también son
 * `xl:`-only). "Analítica en tiempo real" sigue debajo del grid principal, a todo el
 * ancho -- información secundaria, no necesita competir por el mismo alto de pantalla.
 *
 * Reemplaza la ruta `/remates/:remateId/gestionar` que hasta ahora mostraba
 * `GestionRematePlaceholderPage` (Épica 5.1) -- mismo patrón que la Sala reemplazó su
 * propio placeholder entre los Módulos 4.4 y 4.5, sin tocar el árbol de rutas.
 *
 * Retexturizado en la Épica 9, Etapa 10 (mismo sistema visual que la Sala del Remate y
 * el Dashboard del Rematador ya retexturizados -- ver prototipo aprobado, sin copiar su
 * layout): `font-display` + tokens `ink`/`line` en toda la página y sus subcomponentes
 * (`ConsolaHeader`, `ConsolaLotePanel`, `ConsolaSidebar`, `ConsolaUpcomingLotesPanel`,
 * `ConsolaDesiertoLotesPanel`, `ConsolaBotsPanel`, `RequeueLoteForm`,
 * `DesiertoLoteNotice`, y `OfferHistoryPanel`/`ChatPanel`/`PresenceCounter`, compartidos
 * con la Sala). `ConsolaHeader` pierde su "hero card" (mismo criterio que ya aplicó
 * `SalaHeader`); "Próximos lotes" pasa de card a composición abierta con solo un eyebrow
 * arriba (mismo patrón que usa `SalaPage` para su propia tira de próximos lotes). El
 * panel de control (`ConsolaControlPanel`) mantiene su agrupación en cards a propósito
 * -- ahí sí tiene sentido: cada card separa acciones por zona de riesgo real (gestión de
 * lote / controles de remate / zona crítica), no es "más cards" sin motivo.
 *
 * `ConsolaControlPanel` ("la botonera") queda exclusivo del rematador operador asignado
 * -- oculto para la empresa dueña (`isOwner`, mismo chequeo `user?.id === remate.owner_id`
 * que ya usaban `OperatorCodePanel`/`AnalyticsPanel`), que en su lugar ve la analítica.
 * Cuando se oculta, el subgrid de esa fila colapsa a una sola columna para que
 * `ConsolaLotePanel` ocupe todo el ancho en vez de dejar un hueco de 360px.
 *
 * `ConsolaBotsPanel` ("Simuladores") vive en el panel del rematador operador (mismo
 * chequeo `!isOwner`), no en el de la empresa -- pedido explícito: es una herramienta de
 * testeo temporal para probar el remate en vivo mientras se gestiona, no algo que tenga
 * sentido mostrarle a la empresa dueña. El backend se actualizó en conjunto
 * (`BotSimulationService` usa `get_operator_or_raise`, no `get_owned_or_raise`, y
 * `POST /bots` acepta `empresa` o `rematador` -- ver `bots/router.py`/`bots/service.py`)
 * para que el rematador operador asignado pueda de verdad seleccionar/iniciar bots, no
 * solo la empresa dueña.
 *
 * `OperatorCodePanel` ("Datos para el rematador") y `StreamPanel` ("Transmisión en
 * vivo") solo se renderizan acá arriba, a todo lo ancho, mientras el remate NO está
 * operativo (`!isOperational` -- borrador/programado, sin sidebar de chat/ofertas al
 * que anclar un botón): la idea sigue siendo que la empresa pueda dejar el operador
 * asignado con anticipación, antes de que arranque el remate en vivo. Una vez operativo
 * (`live`/`paused`), estas dos cards a todo lo ancho desaparecen -- pasan a ser los dos
 * botones plegables de `ConsolaQuickPanels` (diseño aprobado, "Transmisión"/
 * "Martillero"), dentro de `ConsolaSidebar`, a la misma altura que `ConsolaHeader`.
 */
export function ConsolaOperativaPage() {
  const { remateId } = useParams<{ remateId: string }>();
  const { remate: remateDetail, isLoading: isRemateTypeLoading } = useRemateDetail(remateId ?? '');

  // Un Timed no se opera lote por lote como un remate en vivo -- tiene su propio panel
  // (tablero de lotes + analítica). El branch va acá, en el wrapper, para que
  // `LiveConsolaOperativaPage` (todos los hooks de la consola en vivo, incluida la
  // conexión WebSocket) nunca se monte para un Timed.
  if (isRemateTypeLoading) return <ConsolaSkeleton />;
  if (remateDetail?.auction_type === 'timed') return <TimedConsolaPage remateId={remateDetail.id} />;
  return <LiveConsolaOperativaPage />;
}

function LiveConsolaOperativaPage() {
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
    desiertoLotes,
    connectionStatus,
    subscribeToRealtime,
  } = useLiveRemateState(remateId ?? '');

  // "Modo Remate" se activa apenas el remate está operativo (`live`/`paused`), sin
  // importar si todavía está cargando o si hubo un error -- se calcula acá, antes de
  // los `return` tempranos de abajo, porque un Hook no puede llamarse condicionalmente.
  const isOperational = snapshot?.remate.status === 'live' || snapshot?.remate.status === 'paused';
  // La empresa dueña, en su propio remate en vivo, no navega: sin riel lateral.
  const isOwnerLive = isOperational && Boolean(user) && user?.id === snapshot?.remate.owner_id;
  useFocusMode(isOperational, isOwnerLive);

  // Cartel de "remate finalizado" (empresa y rematador): aparece apenas llega
  // `remate.finished` y los redirige, en vez de dejarlos frente al `EmptyState` de abajo.
  const hasRemateFinished = useRemateFinishedSignal(subscribeToRealtime);

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
  // Gestionar el remate en vivo (la "botonera" de `ConsolaControlPanel`) queda exclusivo
  // del rematador operador asignado -- la empresa dueña ya no opera desde acá, aunque el
  // backend (`get_operator_or_raise`, ADR-048) todavía se lo permitiría si llamara a los
  // endpoints directamente. A cambio, la empresa es la única que ve la analítica más
  // abajo (mismo chequeo, ya existía).
  const isOwner = user?.id === remate.owner_id;
  // "Datos para el rematador" (ID + código de operador) es lo primero que tiene que ver
  // la empresa dueña al entrar acá -- antes vivía como un panel angosto al final de la
  // página, solo mientras el remate ya estaba en vivo/pausado, así que no había forma de
  // dejar el operador armado con anticipación. Se excluyen `finished`/`cancelled`:
  // generar o compartir un código para un remate que ya terminó no tiene ninguna acción
  // útil detrás.
  const showOperatorCodePanel = isOwner && remate.status !== 'finished' && remate.status !== 'cancelled';
  // Mismo criterio que `showOperatorCodePanel`, pero solo para un remate privado (ver
  // `PrivateAccessPanel`) -- uno público no tiene ninguna credencial que mostrar acá.
  const showPrivateAccessPanel =
    isOwner &&
    remate.access_type === 'private' &&
    remate.status !== 'finished' &&
    remate.status !== 'cancelled';

  // La transmisión la cargan tanto la empresa dueña como el rematador asignado (el backend
  // permite ambos: `set_stream` usa `get_operator_or_raise`) -- el que esté frente al vivo.
  const showStreamPanel = remate.status !== 'finished' && remate.status !== 'cancelled';

  // La empresa dueña no opera el remate: con el remate en vivo/pausado ve la "Cabina"
  // (ver `EmpresaConsolaView`), no la consola del martillero de más abajo.
  if (isOwner && isOperational) {
    return (
      <EmpresaConsolaView
        remate={remate}
        activeLote={activeLote}
        winningOffer={winningOffer}
        recentOffers={recentOffers}
        connectedUsers={connectedUsers}
        connectionStatus={connectionStatus}
        upcomingLotes={upcomingLotes}
        desiertoLotes={desiertoLotes}
        currency={currency}
        currentUserId={user?.id}
        subscribeToRealtime={subscribeToRealtime}
        onRemateChange={reload}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4 font-display">
      {hasRemateFinished && (
        <RemateFinishedNotice remateId={remate.id} currency={currency} audience={isOwner ? 'empresa' : 'martillero'} />
      )}
      {!isOperational && showOperatorCodePanel && <OperatorCodeLauncher remate={remate} onChanged={reload} />}
      {showPrivateAccessPanel && <PrivateAccessPanel remate={remate} />}
      {!isOperational && showStreamPanel && <StreamPanel remate={remate} onChange={reload} />}

      {!isOperational ? (
        <>
          <ConsolaHeader remate={remate} connectedUsers={connectedUsers} connectionStatus={connectionStatus} />
          <EmptyState
            icon={<GavelIcon className="h-10 w-10" />}
            title={remate.status === 'finished' ? 'El remate finalizó correctamente' : 'Esta consola es para remates en vivo'}
            description={NOT_OPERATIONAL_MESSAGES[remate.status]}
            action={
              <div className="flex flex-wrap justify-center gap-2">
                {remate.status === 'finished' && (
                  <Button variant="primary" onClick={() => navigate(`/remates/${remate.id}/historial`)}>
                    Ver resumen
                  </Button>
                )}
                <Button variant="secondary" onClick={() => navigate('/')}>
                  Volver al dashboard
                </Button>
              </div>
            }
          />
        </>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_380px] xl:items-start">
            <div className="xl:col-start-1 xl:row-start-1">
              <ConsolaHeader remate={remate} connectedUsers={connectedUsers} connectionStatus={connectionStatus} />
            </div>

            <div className="flex flex-col gap-4 xl:col-start-1 xl:row-start-2">
              <div className={isOwner ? 'grid grid-cols-1 gap-4' : 'grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]'}>
                <div className="min-w-0">
                  <ConsolaLotePanel activeLote={activeLote} currency={currency} hasUpcomingLotes={hasUpcomingLotes} />
                </div>

                {!isOwner && (
                  <ConsolaControlPanel
                    remate={remate}
                    activeLote={activeLote}
                    winningOffer={winningOffer}
                    recentOffers={recentOffers}
                    selectedLoteId={selectedLoteId}
                    hasUpcomingLotes={hasUpcomingLotes}
                  />
                )}
              </div>

              <div className="flex flex-col gap-3">
                <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">
                  <ListOrdered aria-hidden="true" className="h-3.5 w-3.5" />
                  Próximos lotes
                </h2>
                <ConsolaUpcomingLotesPanel
                  lotes={upcomingLotes}
                  selectedLoteId={selectedLoteId}
                  onSelect={setSelectedLoteId}
                  selectionEnabled={remate.status === 'live' && !activeLote}
                />
              </div>

              <ConsolaDesiertoLotesPanel
                remateId={remate.id}
                lotes={desiertoLotes}
                currency={currency}
                canUseCustomPrice={isOwner}
              />
            </div>

            {/* Sin `xl:self-stretch` a propósito (ver el comentario del layout arriba):
             * la caja contenida de esta celda es lo que acota el recorrido del bloque
             * sticky de ofertas+chat de `ConsolaSidebar` -- deja de bajar al chocar con
             * la sección de analítica, que vive debajo del grid. */}
            <div className="xl:col-start-2 xl:row-start-1 xl:row-span-2">
              <ConsolaSidebar
                remateId={remate.id}
                subscribeToRealtime={subscribeToRealtime}
                currentUserId={user?.id}
                connectedUsers={connectedUsers}
                winningOffer={winningOffer}
                recentOffers={recentOffers}
                currency={currency}
                remate={remate}
                isOwner={isOwner}
                onRemateChange={reload}
              />
            </div>
          </div>

          {/* Analítica secundaria (pedido explícito: "no debe competir visualmente con
           * la operación del remate") -- mismo `AnalyticsPanel` de siempre (que ya trae
           * su propio encabezado "Analítica en tiempo real"), sin tocar su interior,
           * solo envuelto con menos peso visual que el resto de la consola.
           *
           * Oculta para el rematador operador (ADR-048): `AnalyticsService.build` es
           * owner-only en el backend (`_is_privileged`, sin excepción para el operador
           * asignado -- es información comercial de la empresa, no algo que haga falta
           * para correr el remate en vivo), así que mostrársela a un rematador que no es
           * dueño solo renderiza un error 403 sin ninguna acción posible. Mismo criterio
           * que la tarjeta "Datos para el rematador" al principio de la página: no
           * mostrar una sección que va a fallar. */}
          {isOwner && (
            <div className="rounded-xl border border-line bg-surface-subtle/60 p-4 opacity-90">
              <AnalyticsPanel remateId={remate.id} subscribeToRealtime={subscribeToRealtime} currency={currency} />
            </div>
          )}

          {/* Simuladores (módulo de Bots Simuladores) -- pedido explícito: herramienta de
           * testeo temporal (se va a eliminar más adelante), pensada para probarse desde
           * el panel del rematador operador mientras gestiona el remate, no desde el de
           * la empresa. Va al final de la página, después de la analítica de la empresa,
           * en vez de mezclada con los paneles operativos reales (Próximos lotes/Lotes
           * desiertos) que sí son parte del producto. */}
          {!isOwner && <ConsolaBotsPanel remateId={remate.id} />}
        </>
      )}
    </div>
  );
}
