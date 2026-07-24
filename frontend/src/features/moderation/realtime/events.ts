/**
 * Tipos de los eventos de dominio de Moderación sincronizados en tiempo real (Épica 7,
 * Módulo 7.6) -- reflejan `backend/app/moderation/events.py`, sin cambios en el backend.
 * Unión propia, mismo criterio que `features/chat/realtime/events.ts`: este feature
 * filtra los mismos mensajes `domain_event` crudos del único `WebSocketClient`
 * compartido (`subscribeToRealtime`), sin que `features/sala/` necesite saber que la
 * moderación existe.
 */

interface ModerationDomainEventBase {
  event_id: string;
  remate_id: string;
  occurred_at: string;
}

export interface ModerationUserKickedEvent extends ModerationDomainEventBase {
  event_type: 'moderacion.usuario_expulsado';
  user_id: string;
  user_name: string | null;
  banned_by: string;
  reason: string | null;
}

export interface ModerationUserMutedEvent extends ModerationDomainEventBase {
  event_type: 'moderacion.usuario_silenciado';
  user_id: string;
  user_name: string | null;
  muted_by: string;
  duration_seconds: number;
}

export interface ModerationChatLockedEvent extends ModerationDomainEventBase {
  event_type: 'moderacion.chat_bloqueado';
  locked_by: string;
  duration_seconds: number;
}

export interface ModerationMessagePinnedEvent extends ModerationDomainEventBase {
  event_type: 'moderacion.mensaje_destacado';
  message_id: string;
  pinned_by: string;
}

export interface ModerationMessageUnpinnedEvent extends ModerationDomainEventBase {
  event_type: 'moderacion.mensaje_no_destacado';
  message_id: string;
}

export interface ModerationInvalidBidThresholdExceededEvent extends ModerationDomainEventBase {
  event_type: 'moderacion.umbral_ofertas_invalidas_superado';
  buyer_id: string;
  attempt_count: number;
  threshold: number;
}

export type ModerationDomainEvent =
  | ModerationUserKickedEvent
  | ModerationUserMutedEvent
  | ModerationChatLockedEvent
  | ModerationMessagePinnedEvent
  | ModerationMessageUnpinnedEvent
  | ModerationInvalidBidThresholdExceededEvent;

const MODERATION_EVENT_TYPES = new Set<string>([
  'moderacion.usuario_expulsado',
  'moderacion.usuario_silenciado',
  'moderacion.chat_bloqueado',
  'moderacion.mensaje_destacado',
  'moderacion.mensaje_no_destacado',
  'moderacion.umbral_ofertas_invalidas_superado',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function isModerationDomainEventMessage(
  message: unknown,
): message is { type: 'domain_event'; event_type: string; payload: ModerationDomainEvent } {
  return (
    isRecord(message) &&
    message.type === 'domain_event' &&
    typeof message.event_type === 'string' &&
    MODERATION_EVENT_TYPES.has(message.event_type) &&
    isRecord(message.payload)
  );
}
