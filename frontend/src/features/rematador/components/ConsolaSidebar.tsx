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

export interface ConsolaSidebarProps {
  remateId: string;
  subscribeToRealtime: (listener: (message: unknown) => void) => () => void;
  currentUserId: string | undefined;
  connectedUsers: number;
  winningOffer: OfertaSnapshotEntry | null;
  recentOffers: OfertaSnapshotEntry[];
  currency: string;
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
 * "Modo Remate" pide historial de ofertas + chat "siempre visibles" -- a diferencia de la
 * versión anterior (cuatro pestañas iguales, Ofertas era una más), acá el historial de
 * ofertas se saca de las pestañas y queda fijo arriba; solo Chat/Conectados/Moderación
 * siguen en pestañas (Chat por default) porque son de uso más ocasional o necesitan más
 * alto que lo que queda debajo de la oferta.
 *
 * El historial de ofertas reusa `OfferHistoryPanel` de `features/sala/` tal cual, la
 * misma tarjeta que ya ve el comprador en la Sala (pedido explícito: "quiero que el
 * rematador vea la misma card con todo igual") -- ya no hay una versión propia de la
 * Consola con su resaltado de fila ganadora/`maxHistory` (existían antes de este pedido).
 * Mismo alto fijo por default (`h-72 shrink-0`, sin pasar `className`) que ya usa la Sala
 * para su propio sidebar -- este sidebar tiene la misma estructura (tarjeta de oferta fija
 * arriba, chat abajo con `flex-1`), así que el mismo alto encaja igual.
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
 */
export function ConsolaSidebar({
  remateId,
  subscribeToRealtime,
  currentUserId,
  connectedUsers,
  winningOffer,
  recentOffers,
  currency,
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
    // Alto capado al viewport (`xl:max-h-[calc(100vh-2rem)]`, mismo offset que ya usa
    // `SalaPage` para su propio sidebar sticky) en vez de un `h-` fijo -- pedido explícito:
    // que oferta+chat tengan "un tamaño definido... ocupando todo el alto de la pantalla"
    // en vez de encogerse al tamaño de su contenido (eso fue lo que causaba el hueco en
    // blanco antes de la analítica: sin `xl:self-stretch` en el wrapper de
    // `ConsolaOperativaPage`, esta columna medía menos que la del lote/control/próximos
    // lotes de al lado, y quedaba más corta que esa celda del grid). `self-stretch` hace
    // que el wrapper mida el alto completo de la celda (la del grupo izquierdo, más alto);
    // `max-h` capa ese alto al viewport para que `sticky` tenga lugar de sobra para
    // "viajar" antes de toparse con el borde inferior de la celda, que es justo donde
    // arranca la analítica -- si la celda es más baja que el viewport (remate con poco
    // contenido a la izquierda), el `max-h` no fuerza nada de más porque nunca se llega a
    // ese tope. `xl:h-full` + `flex` reparte ese alto entre la oferta (arriba, alto fijo
    // por `OfferHistoryPanel`) y las pestañas de abajo (`xl:flex-1`, ver más abajo) -- el
    // chat ocupa lo que sobra en vez de un `h-[26rem]` fijo, así que no se encoge ni deja
    // hueco sea cual sea el alto disponible. Por debajo de `xl:` nada de esto aplica (`flex
    // flex-col gap-3` a secas): layout de una sola columna, cada card con su alto fijo de
    // siempre. Cada card sigue con su propio scroll interno (pedido explícito: "solo
    // scroll interno dentro de cada uno") -- el historial de `OfferHistoryPanel` y los
    // mensajes de `ChatPanel` scrollean cada uno dentro de su propia caja (ver su
    // `overflow-y-auto` interno), nunca el wrapper completo.
    <div className="flex flex-col gap-3 xl:sticky xl:top-4 xl:h-full xl:max-h-[calc(100vh-2rem)]">
      <div className="shrink-0">
        <OfferHistoryPanel winningOffer={winningOffer} recentOffers={recentOffers} currency={currency} />
      </div>

      <div className="flex flex-col gap-2 xl:min-h-0 xl:flex-1">
        <div className="shrink-0 rounded-xl border border-slate-200 bg-white px-2 pt-1 shadow-sm">
          <Tabs
            tabs={TABS}
            activeId={activeTab}
            onChange={(id) => setActiveTab(id as TabId)}
            className="border-b-0"
          />
        </div>

        {activeTab === 'chat' && (
          <ChatPanel
            remateId={remateId}
            subscribeToRealtime={subscribeToRealtime}
            currentUserId={currentUserId}
            connectedUsers={connectedUsers}
            canModerate
            className="h-[26rem] xl:h-auto xl:min-h-0 xl:flex-1"
          />
        )}

        {activeTab === 'conectados' && (
          <div className="h-[26rem] overflow-y-auto xl:h-auto xl:min-h-0 xl:flex-1">
            <ConnectedBuyersList remateId={remateId} reloadToken={reloadToken} />
          </div>
        )}

        {activeTab === 'moderacion' && (
          <div className="flex h-[26rem] flex-col gap-3 overflow-y-auto xl:h-auto xl:min-h-0 xl:flex-1">
            <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <span className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <ShieldAlert aria-hidden="true" className="h-4 w-4 text-slate-400" />
                Moderación
              </span>
              <LockChatButton remateId={remateId} onLocked={() => setReloadToken((token) => token + 1)} />
            </div>
            <RecentModerationActions remateId={remateId} key={reloadToken} />
          </div>
        )}
      </div>
    </div>
  );
}
