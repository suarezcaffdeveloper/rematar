import { useEffect, useState } from 'react';
import type { useLiveRemateState } from './hooks';
import { isDomainEventMessage } from './realtime/messages';

type SubscribeToRealtime = ReturnType<typeof useLiveRemateState>['subscribeToRealtime'];

/**
 * `true` desde que llega `remate.finished` por WebSocket durante esta visita a la pantalla.
 * Solo reacciona al evento en vivo (no a un remate que ya estaba finalizado al entrar), para
 * que el cartel de fin de remate aparezca únicamente en el momento en que el remate cierra.
 */
export function useRemateFinishedSignal(subscribeToRealtime: SubscribeToRealtime): boolean {
  const [finished, setFinished] = useState(false);
  useEffect(() => {
    return subscribeToRealtime((message) => {
      if (isDomainEventMessage(message) && message.payload.event_type === 'remate.finished') {
        setFinished(true);
      }
    });
  }, [subscribeToRealtime]);
  return finished;
}
