/**
 * Tipos de los eventos de dominio del chat sincronizados en tiempo real (Épica 6,
 * Módulo 6.4) -- reflejan `backend/app/modules/chat/events.py`, sin cambios en el
 * backend. UNIÓN PROPIA, deliberadamente separada de `SalaDomainEvent`
 * (`features/sala/realtime/events.ts`, sin tocar): este feature filtra los mismos
 * mensajes `domain_event` crudos por su cuenta (ver `client.ts`, "cada feature decide
 * qué le importa"), sin que `features/sala/` necesite saber que el chat existe.
 */

import type { ChatMessageKind } from '../types';

interface ChatDomainEventBase {
  event_id: string;
  remate_id: string;
  occurred_at: string;
}

export interface ChatMessageSentEvent extends ChatDomainEventBase {
  event_type: 'chat.message_sent';
  message_id: string;
  kind: ChatMessageKind;
  author_id: string | null;
  author_name: string | null;
  author_role: string | null;
  content: string;
  system_event_type: string | null;
  created_at: string;
  author_avatar_url: string | null;
}

export interface ChatMessageDeletedEvent extends ChatDomainEventBase {
  event_type: 'chat.message_deleted';
  message_id: string;
}

export interface ChatUserTypingEvent extends ChatDomainEventBase {
  event_type: 'chat.user_typing';
  user_id: string;
  user_name: string;
}

export type ChatDomainEvent = ChatMessageSentEvent | ChatMessageDeletedEvent | ChatUserTypingEvent;

const CHAT_EVENT_TYPES = new Set<string>([
  'chat.message_sent',
  'chat.message_deleted',
  'chat.user_typing',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Type guard sobre un mensaje YA parseado del `WebSocketClient` compartido
 * (`subscribeToRealtime`, `features/sala/hooks.ts`) -- filtra por `type: 'domain_event'`
 * + `event_type` propio del chat, ignorando cualquier otro mensaje (snapshot, eventos de
 * sala, presencia) sin necesitar conocer sus formas. */
export function isChatDomainEventMessage(
  message: unknown,
): message is { type: 'domain_event'; event_type: string; payload: ChatDomainEvent } {
  return (
    isRecord(message) &&
    message.type === 'domain_event' &&
    typeof message.event_type === 'string' &&
    CHAT_EVENT_TYPES.has(message.event_type) &&
    isRecord(message.payload)
  );
}
