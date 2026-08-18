import { useState } from 'react';
import clsx from 'clsx';
import { Tabs, type TabItem } from '../../../shared/components/Tabs';
import { ChatPanel } from '../../chat/components/ChatPanel';
import type { OfertaSnapshotEntry } from '../types';
import { OfferHistoryList } from './OfferHistoryList';

export interface SalaSidePanelProps {
  recentOffers: OfertaSnapshotEntry[];
  currency: string;
  remateId: string;
  subscribeToRealtime: (listener: (message: unknown) => void) => () => void;
  currentUserId: string | undefined;
  connectedUsers: number;
  className?: string;
}

type SidePanelTabId = 'history' | 'chat';

const SIDE_TABS: TabItem[] = [
  { id: 'chat', label: 'Chat' },
  { id: 'history', label: 'Historial de ofertas' },
];

/**
 * Reemplaza el apilado `OfferHistoryPanel` + `ChatPanel` de siempre por un único lugar
 * fijo que alterna entre los dos con pestañas (`Tabs`, componente compartido, sin
 * cambios) -- pedido explícito del rediseño: "siempre va a verse en ese lugar y el
 * usuario puede elegir qué ver". El bloque "Comprador líder" que tenía
 * `OfferHistoryPanel` no se repite acá (ver `OfferHistoryList`) -- esa misma info ahora
 * vive en el precio de `SalaBidPanel`.
 *
 * Los dos paneles quedan siempre montados (se alterna qué se ve con `hidden`, no con
 * unmount condicional): `ChatPanel` sostiene su propia conexión/estado (mensajes ya
 * cargados, scroll, "está escribiendo") vía `useChatMessages` -- si se desmontara cada
 * vez que el usuario mira el historial, perdería ese estado y volvería a pedir el
 * historial del chat por HTTP cada vez que se vuelve a esa pestaña. Con `hidden` el
 * comportamiento es idéntico al de antes (`ChatPanel` montado todo el tiempo), solo que
 * ahora puede no ser lo que se está viendo.
 */
export function SalaSidePanel({
  recentOffers,
  currency,
  remateId,
  subscribeToRealtime,
  currentUserId,
  connectedUsers,
  className,
}: SalaSidePanelProps) {
  const [activeTab, setActiveTab] = useState<SidePanelTabId>('chat');

  return (
    <div className={clsx('flex flex-col', className)}>
      <Tabs
        tabs={SIDE_TABS}
        activeId={activeTab}
        onChange={(id) => setActiveTab(id as SidePanelTabId)}
        className="shrink-0"
      />

      <div
        className={clsx(
          'min-h-0 flex-1 overflow-y-auto pt-3',
          activeTab === 'history' ? 'block' : 'hidden',
        )}
      >
        <OfferHistoryList recentOffers={recentOffers} currency={currency} />
      </div>

      <div className={clsx('min-h-0 flex-1 flex-col pt-3', activeTab === 'chat' ? 'flex' : 'hidden')}>
        <ChatPanel
          remateId={remateId}
          subscribeToRealtime={subscribeToRealtime}
          currentUserId={currentUserId}
          connectedUsers={connectedUsers}
          canModerate={false}
          chrome="flat"
          className="h-full"
        />
      </div>
    </div>
  );
}
