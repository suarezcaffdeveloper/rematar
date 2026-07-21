/**
 * Hook del feature de sala -- mismo patrón que `useRemateDetail`
 * (`features/remates/hooks.ts`): una única llamada HTTP, sin polling ni suscripción
 * (Épica 4.5 pide explícitamente NO usar WebSockets todavía).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getSessionAccessToken } from '../../shared/api/client';
import { normalizeApiError, type NormalizedApiError } from '../../shared/api/errors';
import { env } from '../../shared/config/env';
import { WebSocketClient, type ConnectionStatus } from '../../shared/websocket/client';
import { useLotes } from '../remates/hooks';
import type { Lote } from '../remates/types';
import { fetchRemateSnapshotRequest } from './api';
import { isDomainEventMessage, isSnapshotMessage } from './realtime/messages';
import { applyDomainEventToLotes, applyDomainEventToSnapshot } from './realtime/reducer';
import type { RemateStateSnapshot } from './types';

export interface UseRemateSnapshotResult {
  snapshot: RemateStateSnapshot | null;
  isLoading: boolean;
  error: NormalizedApiError | null;
  reload: () => void;
}

/**
 * Trae el snapshot completo de un remate una única vez (al montar, o al llamar
 * `reload()`). Deliberadamente NO hace polling: este módulo pide explícitamente
 * quedarse solo con el Snapshot Service, sin tiempo real todavía.
 *
 * Preparado para un módulo futuro sin reestructurarse: `SalaPage` y todos sus
 * componentes (`SalaHeader`, `ActiveLotePanel`, `OfferHistoryPanel`,
 * `UpcomingLotesStrip`) reciben `snapshot` como una prop de tipo `RemateStateSnapshot` y
 * no saben de dónde salió. El día que exista un cliente WebSocket, un hook nuevo
 * (`useLiveRemateState`, por ejemplo) puede envolver este mismo `useRemateSnapshot` para
 * la carga inicial y aplicarle los eventos entrantes al mismo `RemateStateSnapshot` (que
 * ya lleva `schema_version` pensado para eso) -- ningún componente de presentación
 * necesita cambiar una sola línea. Ver docs/27-sala-del-remate.md, "Preparación para
 * WebSockets".
 */
export function useRemateSnapshot(remateId: string): UseRemateSnapshotResult {
  const [snapshot, setSnapshot] = useState<RemateStateSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<NormalizedApiError | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    fetchRemateSnapshotRequest(remateId)
      .then((result) => {
        if (!cancelled) setSnapshot(result);
      })
      .catch((err) => {
        if (!cancelled) setError(normalizeApiError(err));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [remateId, reloadToken]);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  return { snapshot, isLoading, error, reload };
}

export interface UseLiveRemateStateResult {
  snapshot: RemateStateSnapshot | null;
  isLoading: boolean;
  error: NormalizedApiError | null;
  reload: () => void;
  upcomingLotes: Lote[];
  isUpcomingLotesLoading: boolean;
  connectionStatus: ConnectionStatus;
  /** Reenvía cualquier mensaje ya parseado del ÚNICO `WebSocketClient` de la página
   * (Épica 6, Módulo 6.4) -- para que un feature hermano (`features/chat/`) pueda
   * escuchar sus propios eventos (`chat.message_sent`, etc.) sin abrir una segunda
   * conexión/un segundo `join_room`, que duplicaría el conteo de conectados de
   * Presencia (dos `connection_id` por usuario real). No filtra por `type`: cada
   * feature decide qué le importa, mismo criterio que ya documenta
   * `shared/websocket/client.ts::onMessage`. */
  subscribeToRealtime: (listener: (message: unknown) => void) => () => void;
}

/**
 * Envuelve `useRemateSnapshot` (carga inicial por HTTP, sin tocar) y `useLotes` (de
 * `features/remates/`, reusado tal cual) con una conexión WebSocket al Gateway (Épica 4,
 * Módulo 4.6) -- exactamente la evolución que ya anticipaba
 * `docs/27-sala-del-remate.md`, "Preparación para WebSockets": ningún componente de
 * presentación de `SalaPage` cambia, el WebSocket queda contenido acá.
 *
 * Tres fuentes de estado en memoria, reconciliadas en este orden:
 * 1. `useRemateSnapshot` (HTTP) pinta la pantalla de inmediato, sin esperar el
 *    handshake del WebSocket (mismo `isLoading`/`error`/`reload` que ya usaba
 *    `SalaPage`, sin cambios de comportamiento).
 * 2. Apenas el WebSocket entra a la sala (`join_room`), el Gateway empuja un snapshot
 *    propio (mismo `RemateStateSnapshot`, ver `docs/23-snapshot-service.md`) que
 *    REEMPLAZA por completo el estado en memoria -- esto pasa en la primera conexión y
 *    en cada reconexión, así que resuelve solo cualquier evento perdido durante una
 *    caída de red, sin ningún pedido HTTP adicional.
 * 3. De ahí en más, cada `domain_event` aplica un cambio incremental (`reducer.ts`)
 *    sobre ese mismo objeto en memoria -- nunca se vuelve a pedir nada por HTTP.
 *
 * `lotes` (de `useLotes`) se mantiene como una copia local aparte (`liveLotes`) porque
 * dos cosas dependen de que sus estados reflejen los eventos en vivo, no la foto
 * original: `upcomingLotes` (para que un lote recién abierto deje de listarse entre
 * "próximos") y la reconstrucción de `active_lote` en `lote.opened` (el evento solo trae
 * `lote_id`, no el lote completo -- se busca acá).
 */
export function useLiveRemateState(remateId: string): UseLiveRemateStateResult {
  const {
    snapshot: initialSnapshot,
    isLoading,
    error,
    reload,
  } = useRemateSnapshot(remateId);
  const { lotes, isLoading: isUpcomingLotesLoading } = useLotes(remateId);

  const [liveSnapshot, setLiveSnapshot] = useState<RemateStateSnapshot | null>(null);
  const [liveLotes, setLiveLotes] = useState<Lote[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('idle');

  useEffect(() => {
    setLiveSnapshot(initialSnapshot);
  }, [initialSnapshot]);

  useEffect(() => {
    setLiveLotes(lotes);
  }, [lotes]);

  // Ref, no estado: el handler de mensajes del WebSocket se crea una única vez por
  // conexión (no en cada render) y necesita la lista de lotes más reciente para
  // reconstruir `active_lote` en `lote.opened` -- ver reducer.ts.
  const liveLotesRef = useRef<Lote[]>(liveLotes);
  liveLotesRef.current = liveLotes;

  // `Set` creado desde el primer render, independiente de cuándo exista el cliente WS
  // -- evita una carrera de orden hijo-antes-que-padre de los efectos de React: un
  // `ChatPanel` hijo que se suscribe en su propio `useEffect` de montaje puede correr
  // antes de que el `useEffect` de acá abajo (el que crea el cliente) llegue a
  // ejecutarse. Con este `Set` ya existente desde el principio, `subscribeToRealtime`
  // nunca depende de ese orden -- el cliente, una vez creado, reenvía todo mensaje
  // entrante a los listeners que ya estén (o lleguen a estar) en este mismo `Set`.
  const realtimeListenersRef = useRef<Set<(message: unknown) => void>>(new Set());

  const subscribeToRealtime = useCallback((listener: (message: unknown) => void) => {
    realtimeListenersRef.current.add(listener);
    return () => {
      realtimeListenersRef.current.delete(listener);
    };
  }, []);

  useEffect(() => {
    if (!remateId) return;

    const client = new WebSocketClient({ url: env.wsBaseUrl, getToken: getSessionAccessToken });

    const unsubscribeStatus = client.onStatusChange(setConnectionStatus);
    const unsubscribeMessage = client.onMessage((message) => {
      realtimeListenersRef.current.forEach((listener) => listener(message));

      if (isSnapshotMessage(message)) {
        setLiveSnapshot(message.data);
        return;
      }
      if (isDomainEventMessage(message)) {
        const { payload } = message;
        setLiveLotes((prevLotes) => applyDomainEventToLotes(prevLotes, payload));
        setLiveSnapshot((prevSnapshot) =>
          prevSnapshot ? applyDomainEventToSnapshot(prevSnapshot, payload, liveLotesRef.current) : prevSnapshot,
        );
      }
    });

    client.connect();
    client.joinRoom(remateId);

    return () => {
      unsubscribeStatus();
      unsubscribeMessage();
      client.disconnect();
    };
  }, [remateId]);

  const upcomingLotes = useMemo(
    () => liveLotes.filter((lote) => lote.status === 'pending'),
    [liveLotes],
  );

  return {
    snapshot: liveSnapshot,
    isLoading,
    error,
    reload,
    upcomingLotes,
    isUpcomingLotesLoading,
    connectionStatus,
    subscribeToRealtime,
  };
}
