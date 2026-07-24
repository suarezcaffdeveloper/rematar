import { useEffect, useState } from 'react';
import { Tabs } from '../../../shared/components/Tabs';
import { ChatPanel } from '../../chat/components/ChatPanel';
import { ConnectedBuyersList } from '../../moderation/components/ConnectedBuyersList';
import { LockChatButton } from '../../moderation/components/LockChatButton';
import { RecentModerationActions } from '../../moderation/components/RecentModerationActions';
import { isModerationDomainEventMessage } from '../../moderation/realtime/events';
import type { OfertaSnapshotEntry } from '../../sala/types';
import { ConsolaOfferPanel } from './ConsolaOfferPanel';

export interface ConsolaSidebarProps {
  remateId: string;
  subscribeToRealtime: (listener: (message: unknown) => void) => () => void;
  currentUserId: string | undefined;
  connectedUsers: number;
  winningOffer: OfertaSnapshotEntry | null;
  recentOffers: OfertaSnapshotEntry[];
  currency: string;
}

type TabId = 'chat' | 'ofertas' | 'conectados' | 'moderacion';

const TABS = [
  { id: 'chat', label: 'Chat' },
  { id: 'ofertas', label: 'Ofertas' },
  { id: 'conectados', label: 'Conectados' },
  { id: 'moderacion', label: 'Moderación' },
];

/**
 * Sidebar de la Consola Operativa (Épica 9, Etapa 5 -- rediseño): reemplaza el antiguo
 * apilado de `ChatPanel`/`ModerationPanel`/`AnalyticsPanel` a lo ancho completo (el
 * rematador tenía que hacer scroll más allá del chat y la moderación para llegar a los
 * controles/analítica). Cuatro secciones que el enunciado pide "siempre accesibles"
 * (Chat, Ofertas, Compradores conectados, Moderación) conviven acá en pestañas -- a
 * diferencia de la Sala del comprador (Etapa 4, que apila Chat+Ofertas sin pestañas
 * porque son solo dos), acá son cuatro y la mayoría son de uso ocasional (moderar,
 * revisar conectados) más que "siempre a la vista" como el chat en la Sala.
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
    <div className="flex flex-col gap-2 xl:sticky xl:top-20 xl:h-[calc(100vh-7rem)]">
      <div className="shrink-0 rounded-xl border border-slate-200 bg-white px-2 pt-1 shadow-sm">
        <Tabs
          tabs={TABS}
          activeId={activeTab}
          onChange={(id) => setActiveTab(id as TabId)}
          className="border-b-0"
        />
      </div>

      <div className="min-h-0 flex-1">
        {activeTab === 'chat' && (
          <ChatPanel
            remateId={remateId}
            subscribeToRealtime={subscribeToRealtime}
            currentUserId={currentUserId}
            connectedUsers={connectedUsers}
            canModerate
            className="h-full min-h-[24rem]"
          />
        )}

        {activeTab === 'ofertas' && (
          <div className="h-full overflow-y-auto">
            <ConsolaOfferPanel winningOffer={winningOffer} recentOffers={recentOffers} currency={currency} />
          </div>
        )}

        {activeTab === 'conectados' && (
          <div className="h-full overflow-y-auto">
            <ConnectedBuyersList remateId={remateId} reloadToken={reloadToken} />
          </div>
        )}

        {activeTab === 'moderacion' && (
          <div className="flex h-full flex-col gap-3 overflow-y-auto">
            <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <span className="text-sm font-semibold text-slate-900">Moderación</span>
              <LockChatButton remateId={remateId} onLocked={() => setReloadToken((token) => token + 1)} />
            </div>
            <RecentModerationActions remateId={remateId} key={reloadToken} />
          </div>
        )}
      </div>
    </div>
  );
}
