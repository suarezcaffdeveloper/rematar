import { useEffect, useRef, useState } from 'react';
import { Badge } from '../../../shared/components/Badge';
import { Button } from '../../../shared/components/Button';
import { Input } from '../../../shared/components/Input';
import { Skeleton } from '../../../shared/components/Skeleton';
import { formatDateTime } from '../../../shared/lib/format';
import { useConnectedBuyers } from '../hooks';
import { KickModal } from './KickModal';
import { MuteModal } from './MuteModal';
import type { ConnectedBuyer } from '../types';

export interface ConnectedBuyersListProps {
  remateId: string;
  reloadToken: number;
}

/** Compradores conectados a la sala, con búsqueda por nombre y acciones rápidas de
 * moderación (Épica 7, Módulo 7.6, pedido explícito del enunciado: "Visualizar
 * compradores conectados", "Buscar compradores por nombre"). `reloadToken` sube desde
 * `ConsolaSidebar` (`features/rematador/components/`, Épica 9 Etapa 5) cuando llega un
 * evento en vivo relevante (expulsión/silenciamiento), para que la lista se refresque
 * sin que este componente conozca el WebSocket. */
export function ConnectedBuyersList({ remateId, reloadToken }: ConnectedBuyersListProps) {
  const [search, setSearch] = useState('');
  const { data, isLoading, error, reload } = useConnectedBuyers(remateId, search);
  const [buyerToKick, setBuyerToKick] = useState<ConnectedBuyer | null>(null);
  const [buyerToMute, setBuyerToMute] = useState<ConnectedBuyer | null>(null);

  // `reloadToken` sube en `ConsolaSidebar` ante un evento en vivo relevante -- no en el
  // primer render (`reload` ya dispara su propio fetch inicial vía `useConnectedBuyers`).
  const isFirstRenderRef = useRef(true);
  useEffect(() => {
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false;
      return;
    }
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadToken]);

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Compradores conectados
        </h2>
        <span className="text-sm font-semibold text-slate-700">{data.length}</span>
      </div>

      <Input
        label="Buscar por nombre"
        placeholder="Nombre del comprador"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {error ? (
        <p className="text-sm text-danger-600">No se pudo cargar la lista de conectados.</p>
      ) : isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-12 rounded-lg" />
          ))}
        </div>
      ) : data.length === 0 ? (
        <p className="text-sm text-slate-500">Ningún comprador coincide.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {data.map((buyer) => (
            <li
              key={buyer.user_id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2"
            >
              <div className="flex min-w-0 flex-col">
                <span className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  {buyer.full_name ?? `Usuario #${buyer.user_id.slice(0, 8)}`}
                  {buyer.is_muted && (
                    <Badge variant="warning">Silenciado</Badge>
                  )}
                </span>
                <span className="text-xs text-slate-400">
                  Conectado {formatDateTime(buyer.connected_at)}
                </span>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setBuyerToMute(buyer)}>
                  Silenciar
                </Button>
                <Button variant="danger" onClick={() => setBuyerToKick(buyer)}>
                  Expulsar
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {buyerToKick && (
        <KickModal
          isOpen
          onClose={() => setBuyerToKick(null)}
          remateId={remateId}
          buyerId={buyerToKick.user_id}
          buyerName={buyerToKick.full_name}
          onKicked={reload}
        />
      )}
      {buyerToMute && (
        <MuteModal
          isOpen
          onClose={() => setBuyerToMute(null)}
          remateId={remateId}
          buyerId={buyerToMute.user_id}
          buyerName={buyerToMute.full_name}
          onMuted={reload}
        />
      )}
    </div>
  );
}
