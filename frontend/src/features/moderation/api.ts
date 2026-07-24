/**
 * Llamadas HTTP del feature de Moderación (Épica 7, Módulo 7.6). Ver
 * docs/42-moderacion-en-tiempo-real.md.
 */

import { apiClient } from '../../shared/api/client';
import type { AuditLogEntry } from '../audit/types';
import type { Page } from '../../shared/api/types';
import type { ConnectedBuyer, PinnedMessage } from './types';

export async function kickBuyerRequest(
  remateId: string,
  userId: string,
  reason?: string,
): Promise<void> {
  await apiClient.post(`/remates/${remateId}/moderation/expulsar`, { user_id: userId, reason });
}

export async function muteBuyerRequest(
  remateId: string,
  userId: string,
  durationSeconds: number,
): Promise<void> {
  await apiClient.post(`/remates/${remateId}/moderation/silenciar`, {
    user_id: userId,
    duration_seconds: durationSeconds,
  });
}

export async function lockChatRequest(remateId: string, durationSeconds: number): Promise<void> {
  await apiClient.post(`/remates/${remateId}/moderation/bloquear-chat`, {
    duration_seconds: durationSeconds,
  });
}

export async function pinMessageRequest(remateId: string, messageId: string): Promise<void> {
  await apiClient.post(`/remates/${remateId}/moderation/mensajes/${messageId}/destacar`);
}

export async function unpinMessageRequest(remateId: string, messageId: string): Promise<void> {
  await apiClient.delete(`/remates/${remateId}/moderation/mensajes/${messageId}/destacar`);
}

export async function fetchConnectedBuyersRequest(
  remateId: string,
  search?: string,
): Promise<ConnectedBuyer[]> {
  const { data } = await apiClient.get<ConnectedBuyer[]>(
    `/remates/${remateId}/moderation/conectados`,
    { params: search ? { search } : undefined },
  );
  return data;
}

export async function fetchPinnedMessagesRequest(remateId: string): Promise<PinnedMessage[]> {
  const { data } = await apiClient.get<PinnedMessage[]>(
    `/remates/${remateId}/moderation/destacados`,
  );
  return data;
}

export async function fetchModerationHistoryRequest(
  remateId: string,
  page: number,
  pageSize: number,
): Promise<Page<AuditLogEntry>> {
  const { data } = await apiClient.get<Page<AuditLogEntry>>(
    `/remates/${remateId}/moderation/historial`,
    { params: { page, page_size: pageSize } },
  );
  return data;
}
