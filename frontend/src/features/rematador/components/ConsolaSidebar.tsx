import { useEffect, useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { Tabs } from '../../../shared/components/Tabs';
import { ChatPanel } from '../../chat/components/ChatPanel';
import { ConnectedBuyersList } from '../../moderation/components/ConnectedBuyersList';
import { LockChatButton } from '../../moderation/components/LockChatButton';
import { RecentModerationActions } from '../../moderation/components/RecentModerationActions';
import { isModerationDomainEventMessage } from '../../moderation/realtime/events';
import { OfferHistoryPanel } from '../../sala/components/OfferHistoryPanel';
import type { OfertaSnapshotEntry } from '../../sala/types';
import { ConsolaQuickPanels } from './ConsolaQuickPanels';
import type { Remate } from '../../remates/types';

export interface ConsolaSidebarProps {
  remateId: string;
  subscribeToRealtime: (listener: (message: unknown) => void) => () => void;
  currentUserId: string | undefined;
  connectedUsers: number;
  winningOffer: OfertaSnapshotEntry | null;
  recentOffers: OfertaSnapshotEntry[];
  currency: string;
  /** Remate completo + si el viewer es la empresa dueña -- solo para los botones
   * plegables de `ConsolaQuickPanels` ("Transmisión"/"Martillero") que arrancan arriba
   * de este sidebar, a la misma altura que `ConsolaHeader`. */
  remate: Remate;
  isOwner: boolean;
  onRemateChange: (remate: Remate) => void;
}

type TabId = 'chat' | 'conectados' | 'moderacion';

const TABS = [
  { id: 'chat', label: 'Chat' },
  { id: 'conectados', label: 'Conectados' },
  { id: 'moderacion', label: 'Moderación' },
];

/**
 * Sidebar de la Consola Operativa (Épica 9, Etapa 5 -- rediseño; y de nuevo en el
 * rediseño a "Modo Remate"): reemplaza el antiguo apilado de `ChatPanel`/
 * `ModerationPanel`/`AnalyticsPanel` a lo ancho completo (el rematador tenía que hacer
 * scroll más allá del chat y la moderación para llegar a los controles/analítica).
 *
 * "Modo Remate" pide historial de ofertas visible sin entrar a una pestaña -- a
 * diferencia de la versión anterior (cuatro pestañas iguales, Ofertas era una más), acá
 * el historial de ofertas se saca de las pestañas y queda arriba de ellas; solo Chat/
 * Conectados/Moderación siguen en pestañas (Chat por default) porque son de uso más
 * ocasional. Pedido posterior (vista de la empresa): ofertas + pestañas quedan `sticky`
 * al scrollear (bajan con el scroll hasta pegarse arriba, frenando contra la sección de
 * analítica -- ver el comentario del `return`) -- la empresa quiere ver siempre eso
 * mientras recorre la página; los botones de arriba (`ConsolaQuickPanels`) y el header,
 * en cambio, se van con el scroll.
 *
 * El historial de ofertas reusa `OfferHistoryPanel` de `features/sala/` tal cual, la
 * misma tarjeta que ya ve el comprador en la Sala (pedido explícito: "quiero que el
 * rematador vea la misma card con todo igual") -- ya no hay una versión propia de la
 * Consola con su resaltado de fila ganadora/`maxHistory` (existían antes de este pedido).
 * Mismo alto fijo por default (`h-72 shrink-0`, sin pasar `className`) que ya usa la Sala
 * para su propio sidebar.
 *
 * "Compradores conectados" reusa `ConnectedBuyersList` (Moderación, con búsqueda y
 * acciones de silenciar/expulsar) en vez del `ConnectedUsersList` genérico y
 * anonimizado que existía antes en esta pantalla -- el enunciado pide explícitamente
 * "compradores conectados" (no cualquier conexión), y la versión de Moderación ya
 * cubre exactamente eso con más capacidad (nombre, búsqueda, acciones), así que
 * mantener las dos era duplicar la misma idea con menos funcionalidad en una de ellas.
 *
 * El `reloadToken`/la suscripción a eventos de moderación vivían dentro del extinto
 * `ModerationPanel` -- se mueven acá porque ahora los alimenta a dos pestañas
 * distintas (Conectados y Moderación), no a una sola.
 *
 * Retexturizado en la Épica 9, Etapa 10: `Tabs` ya no vive envuelto en su propia card
 * (`rounded-xl border bg-white shadow-sm`) -- mismo criterio que `SalaSidePanel`, que la
 * usa sin ninguna caja propia (el componente `Tabs` ya dibuja su propio `border-b`). El
 * resto de tokens (`ink`/`line`) se alinean con el resto de la Consola retexturizada.
 * `ChatPanel` pasa a `chrome="flat"` (antes `"boxed"`, su default) por el mismo motivo
 * que ya usa `SalaSidePanel`: la pestaña "Chat" ya funciona como encabezado, repetir
 * "Chat del remate" + el contador de conectados debajo (que además ya se ve en
 * `ConsolaHeader`) era redundante -- ver prototipo aprobado.
 *
 * `ConsolaQuickPanels` ("Transmisión"/"Martillero", diseño aprobado) va como primer
 * elemento acá arriba, antes de la oferta líder -- reemplaza a las cards a todo lo
 * ancho que antes vivían sueltas encima de este grid (`StreamPanel`/`OperatorCodePanel`
 * `variant="card"`, que siguen existiendo tal cual para los estados no operativos, sin
 * sidebar al que anclarse). Al ser el primer hijo de esta columna, arranca a la misma
 * altura que `ConsolaHeader` (el primer -- y único -- hijo de la columna izquierda) sin
 * necesidad de coordinar alturas entre ambos. Pedido posterior (vista de la empresa):
 * ya NO queda `sticky` -- es contenido normal que se va con el scroll de la página,
 * igual que `ConsolaHeader`; lo que sí queda fijo es el bloque ofertas + pestañas de
 * más abajo (ver el comentario del `return`).
 */
export function ConsolaSidebar({
  remateId,
  subscribeToRealtime,
  currentUserId,
  connectedUsers,
  winningOffer,
  recentOffers,
  currency,
  remate,
  isOwner,
  onRemateChange,
}: ConsolaSidebarProps) {
  const [activeTab, setActiveTab] = useState<TabId>('chat');
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    const unsubscribe = subscribeToRealtime((raw) => {
      if (!isModerationDomainEventMessage(raw)) return;
      setReloadToken((token) => token + 1);
    });
    return unsubscribe;
  }, [subscribeToRealtime]);

  return (
    // Pedido explícito (vista de la empresa, última vuelta): de todo lo que se ve al
    // entrar a la consola, lo único que tiene que seguir viéndose al scrollear hacia
    // abajo es el bloque de ofertas recientes + pestañas (Chat/Conectados/Moderación) --
    // "la empresa debería ver eso siempre". La botonera (`ConsolaQuickPanels`,
    // "Transmisión"/"Martillero") y el `ConsolaHeader` (título, estado, fecha, tiempo,
    // conectados) quedan arriba, sin verse una vez que se scrollea: son contenido
    // normal del flujo, sin ningún `sticky`.
    //
    // El comportamiento pedido para ofertas+chat es el `sticky` estándar, con sus dos
    // topes naturales: el bloque BAJA JUNTO CON EL SCROLL (seguimiento visible) hasta
    // que su borde superior llega a `top-4` del viewport -- justo donde estaban los
    // botones, que para entonces ya se fueron -- y ahí se pega mientras le quede caja
    // donde viajar; al agotarse la celda del grid (donde empieza la sección de
    // "Analítica en tiempo real", que vive FUERA del grid, debajo), se despega y se va
    // con el resto de la página. Todo con CSS, sin medir nada por JS.
    //
    // CLAVE: el bloque sticky va con su ALTO NATURAL (ofertas `h-72` + pestañas
    // `h-[26rem]`, los mismos de siempre) -- sin el `xl:h-[calc(100vh-2rem)]` que se le
    // había puesto en el primer intento de este cambio, copiando el patrón de la Sala
    // del comprador. Allá el sidebar sticky arranca en el TOPE de la página (no hay
    // nada arriba suyo) y sí necesita ese alto fijo para no desbordar la pantalla; acá
    // en cambio el bloque arranca debajo de la botonera, y ese alto fijo lo dejaba
    // exactamente del tamaño de la pantalla y ya pegado al tope desde el primer pixel
    // -- un elemento sticky solo puede "viajar" dentro del espacio que le sobra a su
    // contenedor, así que sin espacio sobrante no bajaba NUNCA (el bug reportado: "el
    // chat y las ofertas quedan fijas arriba por más que scrollee"). Con alto natural,
    // los ~60px que le ganan los botones por arriba son justamente el recorrido en el
    // que se lo ve bajar con el scroll antes de pegarse arriba. Por la misma razón las
    // pestañas vuelven a su `h-[26rem]` fijo (el reparto `xl:flex-1`/`xl:h-full` solo
    // existía para llenar el alto de viewport que ya no se usa).
    //
    // La celda del grid en `ConsolaOperativaPage` sigue SIN `xl:self-stretch` (lo
    // necesitaba la botonera cuando era el sticky, para tener caja de sobra hasta el
    // final de la columna izquierda): ahora la caja contenida es justamente lo que
    // acota el recorrido del bloque y lo hace frenar contra la analítica. Y este
    // `<div>` raíz queda con su alto de contenido (el `h-full` del intento anterior ya
    // no hace falta: era para que el sticky de alto fijo no desbordara la celda).
    <div className="flex flex-col gap-3">
      <div className="shrink-0">
        <ConsolaQuickPanels remate={remate} isOwner={isOwner} onRemateChange={onRemateChange} />
      </div>

      <div className="flex flex-col gap-3 xl:sticky xl:top-4">
        <div className="shrink-0">
          <OfferHistoryPanel winningOffer={winningOffer} recentOffers={recentOffers} currency={currency} />
        </div>

        <div className="flex flex-col gap-2">
          <Tabs tabs={TABS} activeId={activeTab} onChange={(id) => setActiveTab(id as TabId)} className="shrink-0" />

          {activeTab === 'chat' && (
            <ChatPanel
              remateId={remateId}
              subscribeToRealtime={subscribeToRealtime}
              currentUserId={currentUserId}
              connectedUsers={connectedUsers}
              canModerate
              chrome="flat"
              className="h-[26rem]"
            />
          )}

          {activeTab === 'conectados' && (
            <div className="h-[26rem] overflow-y-auto">
              <ConnectedBuyersList remateId={remateId} reloadToken={reloadToken} />
            </div>
          )}

          {activeTab === 'moderacion' && (
            <div className="flex h-[26rem] flex-col gap-3 overflow-y-auto">
              <div className="flex items-center justify-between rounded-xl border border-line bg-white p-3 shadow-sm">
                <span className="flex items-center gap-2 text-sm font-semibold text-ink">
                  <ShieldAlert aria-hidden="true" className="h-4 w-4 text-ink-faint" />
                  Moderación
                </span>
                <LockChatButton remateId={remateId} onLocked={() => setReloadToken((token) => token + 1)} />
              </div>
              <RecentModerationActions remateId={remateId} key={reloadToken} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
