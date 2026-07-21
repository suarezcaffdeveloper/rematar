/**
 * Llamadas HTTP del feature de chat (Épica 6, Módulo 6.4) -- mismo patrón que
 * `features/sala/api.ts`. Envío, borrado y "está escribiendo..." van por HTTP (no por
 * el WebSocket ya abierto) -- mismo criterio que `AuctionEngine.place_bid`: la
 * escritura es HTTP, el broadcast en vivo llega por los eventos de dominio que el
 * backend ya reenvía (`ver features/chat/hooks.ts`). Ver ADR-037.
 */

import { apiClient } from '../../shared/api/client';
import type { ChatMessage } from './types';

export async function fetchChatMessagesRequest(
  remateId: string,
  cursor?: { beforeCreatedAt: string; beforeId: string },
): Promise<ChatMessage[]> {
  const { data } = await apiClient.get<ChatMessage[]>(`/remates/${remateId}/chat/messages`, {
    params: cursor
      ? { before_created_at: cursor.beforeCreatedAt, before_id: cursor.beforeId }
      : undefined,
  });
  return data;
}

export async function sendChatMessageRequest(remateId: string, content: string): Promise<ChatMessage> {
  const { data } = await apiClient.post<ChatMessage>(`/remates/${remateId}/chat/messages`, { content });
  return data;
}

export async function deleteChatMessageRequest(
  remateId: string,
  messageId: string,
): Promise<ChatMessage> {
  const { data } = await apiClient.delete<ChatMessage>(
    `/remates/${remateId}/chat/messages/${messageId}`,
  );
  return data;
}

/** Fire-and-forget -- `useChatMessages` ya lo throttlea del lado del cliente antes de
 * llamar (el backend también aplica su propio rate limit, ver `ChatService.notify_typing`,
 * pero no hace falta que este helper maneje ese 429: perder un aviso de "está
 * escribiendo" no tiene ningún efecto visible más allá de un parpadeo del indicador). */
export async function notifyChatTypingRequest(remateId: string): Promise<void> {
  await apiClient.post(`/remates/${remateId}/chat/typing`);
}
