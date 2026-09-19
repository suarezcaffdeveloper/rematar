/**
 * Hook de estado de la sala Timed -- compone piezas ya existentes y genéricas por lote
 * (`useRemateDetail`/`useLotes` de `features/remates/`, el mismo `WebSocketClient` y
 * `applyDomainEventToLotes` que ya usa `features/sala/hooks.ts::useLiveRemateState`)
 * sin depender de `RemateStateSnapshot`/`applyDomainEventToSnapshot` -- esos están
 * armados alrededor de un único "lote activo" (LIVE), mientras que acá conviven varios
 * lotes `open` a la vez. Ver `realtime.ts` para el porqué completo.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getSessionAccessToken } from '../../shared/api/client';
import type { NormalizedApiError } from '../../shared/api/errors';
import { env } from '../../shared/config/env';
import { WebSocketClient, type ConnectionStatus } from '../../shared/websocket/client';
import { useLotes, useRemateDetail } from '../remates/hooks';
import type { Lote, Remate } from '../remates/types';
import { applyDomainEventToLotes } from '../sala/realtime/reducer';
import { isDomainEventMessage } from '../sala/realtime/messages';
import type { OfertaSnapshotEntry } from '../sala/types';
import { fetchLeadingOfferAmountRequest, fetchLoteRecentOffersRequest } from './api';
import {
  applyDomainEventToLeadingAmounts,
  applyDomainEventToLeadingBuyerIds,
  applyDomainEventToOfferActivityVersion,
  type LeadingAmountsByLote,
  type LeadingBuyerIdsByLote,
  type OfferActivityVersionByLote,
} from './realtime';

export interface UseTimedSalaStateResult {
  remate: Remate | null;
  lotes: Lote[];
  leadingAmounts: LeadingAmountsByLote;
  /** `buyer_id` real de quien va liderando cada lote -- comparalo contra el `id` de
   * quien está mirando la pantalla para saber si es él (`TimedSalaPage`, ver
   * `realtime.ts::applyDomainEventToLeadingBuyerIds`). */
  leadingBuyerIds: LeadingBuyerIdsByLote;
  /** Contador por lote, sube en cada oferta aceptada/rechazada -- pasarlo como
   * `refreshToken` a `useLoteRecentOffers` para que el historial del lote fijo en
   * pantalla se mantenga al día sin abrir una segunda conexión WebSocket. */
  offerActivityVersion: OfferActivityVersionByLote;
  isLoading: boolean;
  error: NormalizedApiError | null;
  reload: () => void;
  connectionStatus: ConnectionStatus;
  /** Mismo contrato que `useLiveRemateState().subscribeToRealtime` -- deja que
   * `useRemateAnalytics` (panel de la empresa) se cuelgue de esta misma conexión WebSocket
   * en vez de abrir una segunda. */
  subscribeToRealtime: (listener: (message: unknown) => void) => () => void;
}

export function useTimedSalaState(remateId: string): UseTimedSalaStateResult {
  const { remate, isLoading: isRemateLoading, error: remateError, reload: reloadRemate } = useRemateDetail(remateId);
  const { lotes: initialLotes, isLoading: isLotesLoading, error: lotesError, reload: reloadLotes } = useLotes(remateId);

  const [liveLotes, setLiveLotes] = useState<Lote[]>([]);
  const [leadingAmounts, setLeadingAmounts] = useState<LeadingAmountsByLote>({});
  const [leadingBuyerIds, setLeadingBuyerIds] = useState<LeadingBuyerIdsByLote>({});
  const [offerActivityVersion, setOfferActivityVersion] = useState<OfferActivityVersionByLote>({});
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('idle');
  // Evita re-sembrar el mapa de montos líderes en cada reconexión del WebSocket -- solo
  // hace falta una vez, apenas se conoce la lista inicial de lotes abiertos.
  const hasSeededAmountsRef = useRef(false);
  // Mismo patrón que `useLiveRemateState`: el `Set` existe desde el primer render, así un
  // hijo que se suscribe antes de que el efecto de abajo cree el cliente no se pierde nada.
  const realtimeListenersRef = useRef<Set<(message: unknown) => void>>(new Set());
  const subscribeToRealtime = useCallback((listener: (message: unknown) => void) => {
    realtimeListenersRef.current.add(listener);
    return () => {
      realtimeListenersRef.current.delete(listener);
    };
  }, []);

  useEffect(() => {
    setLiveLotes(initialLotes);
  }, [initialLotes]);

  useEffect(() => {
    if (hasSeededAmountsRef.current || initialLotes.length === 0) return;
    hasSeededAmountsRef.current = true;
    const openLotes = initialLotes.filter((lote) => lote.status === 'open');
    if (openLotes.length === 0) return;

    let cancelled = false;
    void Promise.all(
      openLotes.map(async (lote) => {
        try {
          const amount = await fetchLeadingOfferAmountRequest(remateId, lote.id);
          return [lote.id, amount] as const;
        } catch {
          // Best-effort: si falla, la tarjeta simplemente muestra el precio base hasta
          // que llegue la primera oferta en vivo -- no vale la pena romper la grilla
          // completa por un solo lote que no pudo resolver su monto líder.
          return [lote.id, null] as const;
        }
      }),
    ).then((entries) => {
      if (cancelled) return;
      setLeadingAmounts((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
    });
    return () => {
      cancelled = true;
    };
  }, [initialLotes, remateId]);

  useEffect(() => {
    if (!remateId) return;
    const client = new WebSocketClient({ url: env.wsBaseUrl, getToken: getSessionAccessToken });
    const unsubscribeStatus = client.onStatusChange(setConnectionStatus);
    const unsubscribeMessage = client.onMessage((message) => {
      realtimeListenersRef.current.forEach((listener) => listener(message));
      if (!isDomainEventMessage(message)) return;
      const { payload } = message;
      setLiveLotes((prevLotes) => applyDomainEventToLotes(prevLotes, payload));
      setLeadingAmounts((prevAmounts) => applyDomainEventToLeadingAmounts(prevAmounts, payload));
      setLeadingBuyerIds((prevBuyerIds) => applyDomainEventToLeadingBuyerIds(prevBuyerIds, payload));
      setOfferActivityVersion((prevVersions) => applyDomainEventToOfferActivityVersion(prevVersions, payload));
    });

    client.connect();
    client.joinRoom(remateId);

    return () => {
      unsubscribeStatus();
      unsubscribeMessage();
      client.disconnect();
    };
  }, [remateId]);

  const reload = useCallback(() => {
    reloadRemate();
    reloadLotes();
  }, [reloadRemate, reloadLotes]);

  const sortedLotes = useMemo(
    () => [...liveLotes].sort((a, b) => a.display_order - b.display_order),
    [liveLotes],
  );

  return {
    remate,
    lotes: sortedLotes,
    leadingAmounts,
    leadingBuyerIds,
    offerActivityVersion,
    isLoading: isRemateLoading || isLotesLoading,
    error: remateError ?? lotesError,
    reload,
    connectionStatus,
    subscribeToRealtime,
  };
}

export interface UseLoteRecentOffersResult {
  offers: OfertaSnapshotEntry[];
  isLoading: boolean;
}

/** Historial reciente (enmascarado) de UN lote puntual -- el que está fijo en
 * `LoteQueueList`/mostrado en `TimedLoteBidRail`. Pide de nuevo por HTTP
 * cuando cambia de lote o cuando `refreshToken` sube (`offerActivityVersion` de
 * `useTimedSalaState`, ver `realtime.ts`) -- sin esto, una oferta de otro comprador no
 * se vería reflejada acá hasta el próximo cambio de lote. */
export function useLoteRecentOffers(remateId: string, loteId: string, refreshToken: number): UseLoteRecentOffersResult {
  const [offers, setOffers] = useState<OfertaSnapshotEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    fetchLoteRecentOffersRequest(remateId, loteId)
      .then((result) => {
        if (!cancelled) setOffers(result);
      })
      .catch(() => {
        // Best-effort, mismo criterio que el sembrado inicial de `leadingAmounts` más
        // arriba: si falla, el panel simplemente muestra "sin ofertas" hasta el próximo
        // refetch, no vale la pena romper el resto del panel de detalle por esto.
        if (!cancelled) setOffers([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [remateId, loteId, refreshToken]);

  return { offers, isLoading };
}
