/**
 * Hooks del feature de Moderación (Épica 7, Módulo 7.6). Fetch simple por HTTP, cada uno
 * expone `reload()` -- `ConsolaSidebar` (`features/rematador/components/`, Épica 9
 * Etapa 5) es quien se suscribe una única vez a `subscribeToRealtime` (expuesto por
 * `useLiveRemateState`, `features/sala/hooks.ts`) y decide qué recargar ante cada
 * evento, mismo criterio que el resto de paneles (`AnalyticsPanel`) que prefieren un
 * refetch simple antes que reconciliar estado incremental para datos que no cambian
 * con mucha frecuencia.
 *
 * El boilerplate de fetch/cancelación/reload vive en `useAsyncResource` (Épica 8, Módulo
 * 8.0, revisión técnica) -- antes se repetía a mano en cada hook de este archivo.
 */

import type { Page } from '../../shared/api/types';
import { useAsyncResource, type UseAsyncResourceResult } from '../../shared/hooks/useAsyncResource';
import type { AuditLogEntry } from '../audit/types';
import {
  fetchConnectedBuyersRequest,
  fetchModerationHistoryRequest,
  fetchPinnedMessagesRequest,
} from './api';
import type { ConnectedBuyer, PinnedMessage } from './types';

export type UseConnectedBuyersResult = UseAsyncResourceResult<ConnectedBuyer[]>;

export function useConnectedBuyers(remateId: string, search: string): UseConnectedBuyersResult {
  return useAsyncResource(
    () => fetchConnectedBuyersRequest(remateId, search || undefined),
    [remateId, search],
    [],
    { enabled: Boolean(remateId) },
  );
}

export type UsePinnedMessagesResult = UseAsyncResourceResult<PinnedMessage[]>;

export function usePinnedMessages(remateId: string): UsePinnedMessagesResult {
  return useAsyncResource(() => fetchPinnedMessagesRequest(remateId), [remateId], [], {
    enabled: Boolean(remateId),
  });
}

export type UseModerationHistoryResult = UseAsyncResourceResult<Page<AuditLogEntry> | null>;

export function useModerationHistory(
  remateId: string,
  page: number,
  pageSize: number,
): UseModerationHistoryResult {
  return useAsyncResource(
    () => fetchModerationHistoryRequest(remateId, page, pageSize),
    [remateId, page, pageSize],
    null,
    { enabled: Boolean(remateId) },
  );
}
