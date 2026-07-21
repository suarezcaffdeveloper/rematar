/**
 * Hook del feature de chat (Épica 6, Módulo 6.4). Historial inicial por HTTP + se
 * suscribe al ÚNICO `WebSocketClient` de la página (`subscribeToRealtime`, expuesto por
 * `features/sala/hooks.ts::useLiveRemateState`) para recibir mensajes/borrados/
 * "está escribiendo" en vivo -- sin abrir una segunda conexión.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { normalizeApiError, type NormalizedApiError } from '../../shared/api/errors';
import {
  deleteChatMessageRequest,
  fetchChatMessagesRequest,
  notifyChatTypingRequest,
  sendChatMessageRequest,
} from './api';
import { isChatDomainEventMessage } from './realtime/events';
import type { ChatMessage, TypingUser } from './types';

/** Un usuario "está escribiendo" se considera vigente por esta ventana desde la última
 * señal recibida -- más que el intervalo de throttle del emisor (ver `TYPING_THROTTLE_MS`
 * más abajo) para tolerar una señal perdida ocasional sin parpadear el indicador. */
const TYPING_EXPIRY_MS = 5000;
/** Máximo una llamada a `notifyChatTypingRequest` cada tanto -- protección de cliente,
 * además del rate limit propio del backend (`ChatService.notify_typing`). */
const TYPING_THROTTLE_MS = 3000;

export interface UseChatMessagesResult {
  messages: ChatMessage[];
  isLoading: boolean;
  error: NormalizedApiError | null;
  hasMoreOlder: boolean;
  isLoadingOlder: boolean;
  loadOlder: () => void;
  sendMessage: (content: string) => Promise<void>;
  isSending: boolean;
  sendError: NormalizedApiError | null;
  deleteMessage: (messageId: string) => Promise<void>;
  notifyTyping: () => void;
  typingUsers: TypingUser[];
}

export function useChatMessages(
  remateId: string,
  subscribeToRealtime: (listener: (message: unknown) => void) => () => void,
  currentUserId: string | undefined,
): UseChatMessagesResult {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<NormalizedApiError | null>(null);
  const [hasMoreOlder, setHasMoreOlder] = useState(true);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<NormalizedApiError | null>(null);
  const [typingByUserId, setTypingByUserId] = useState<Map<string, TypingUser>>(new Map());

  const lastTypingSentAtRef = useRef(0);

  const upsertMessage = useCallback((message: ChatMessage) => {
    setMessages((prev) => {
      const index = prev.findIndex((m) => m.id === message.id);
      if (index === -1) return [...prev, message];
      const next = [...prev];
      next[index] = message;
      return next;
    });
  }, []);

  const markDeleted = useCallback((messageId: string) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, is_deleted: true, content: null } : m)),
    );
  }, []);

  // --- Historial inicial ---------------------------------------------------------------

  useEffect(() => {
    if (!remateId) return;
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    fetchChatMessagesRequest(remateId)
      .then((items) => {
        if (cancelled) return;
        setMessages(items);
        setHasMoreOlder(items.length > 0);
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
  }, [remateId]);

  // --- Eventos en vivo -------------------------------------------------------------------

  useEffect(() => {
    const unsubscribe = subscribeToRealtime((raw) => {
      if (!isChatDomainEventMessage(raw)) return;
      const { payload } = raw;

      if (payload.event_type === 'chat.message_sent') {
        upsertMessage({
          id: payload.message_id,
          remate_id: payload.remate_id,
          kind: payload.kind,
          author_id: payload.author_id,
          author_name: payload.author_name,
          author_role: payload.author_role as ChatMessage['author_role'],
          content: payload.content,
          system_event_type: payload.system_event_type,
          is_deleted: false,
          created_at: payload.created_at,
        });
        const authorId = payload.author_id;
        if (authorId) {
          setTypingByUserId((prev) => {
            if (!prev.has(authorId)) return prev;
            const next = new Map(prev);
            next.delete(authorId);
            return next;
          });
        }
        return;
      }

      if (payload.event_type === 'chat.message_deleted') {
        markDeleted(payload.message_id);
        return;
      }

      if (payload.event_type === 'chat.user_typing') {
        if (payload.user_id === currentUserId) return; // nunca mostrarse "escribiendo" a uno mismo
        setTypingByUserId((prev) => {
          const next = new Map(prev);
          next.set(payload.user_id, {
            user_id: payload.user_id,
            user_name: payload.user_name,
            lastSeenAt: Date.now(),
          });
          return next;
        });
      }
    });
    return unsubscribe;
  }, [subscribeToRealtime, currentUserId, upsertMessage, markDeleted]);

  // --- Vencimiento del indicador "está escribiendo..." -----------------------------------

  useEffect(() => {
    if (typingByUserId.size === 0) return;
    const interval = setInterval(() => {
      setTypingByUserId((prev) => {
        const now = Date.now();
        const next = new Map(
          [...prev].filter(([, typing]) => now - typing.lastSeenAt < TYPING_EXPIRY_MS),
        );
        return next.size === prev.size ? prev : next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [typingByUserId.size]);

  // --- Acciones ----------------------------------------------------------------------------

  const loadOlder = useCallback(() => {
    if (isLoadingOlder || !hasMoreOlder || messages.length === 0) return;
    const oldest = messages[0];
    setIsLoadingOlder(true);
    fetchChatMessagesRequest(remateId, {
      beforeCreatedAt: oldest.created_at,
      beforeId: oldest.id,
    })
      .then((older) => {
        if (older.length === 0) {
          setHasMoreOlder(false);
          return;
        }
        setMessages((prev) => [...older, ...prev]);
      })
      .catch(() => {
        // Silencioso a propósito: "cargar más" es una mejora incremental, no una carga
        // crítica -- un reintento (scrollear de nuevo) alcanza, sin bloquear la pantalla
        // con un error por un fallo puntual de paginación.
      })
      .finally(() => setIsLoadingOlder(false));
  }, [remateId, messages, isLoadingOlder, hasMoreOlder]);

  const sendMessage = useCallback(
    async (content: string) => {
      setIsSending(true);
      setSendError(null);
      try {
        const message = await sendChatMessageRequest(remateId, content);
        upsertMessage(message);
      } catch (err) {
        setSendError(normalizeApiError(err));
        throw err;
      } finally {
        setIsSending(false);
      }
    },
    [remateId, upsertMessage],
  );

  const deleteMessage = useCallback(
    async (messageId: string) => {
      const message = await deleteChatMessageRequest(remateId, messageId);
      upsertMessage(message);
    },
    [remateId, upsertMessage],
  );

  const notifyTyping = useCallback(() => {
    const now = Date.now();
    if (now - lastTypingSentAtRef.current < TYPING_THROTTLE_MS) return;
    lastTypingSentAtRef.current = now;
    notifyChatTypingRequest(remateId).catch(() => {
      // Best-effort -- perder un aviso de "está escribiendo" no tiene efecto visible.
    });
  }, [remateId]);

  return {
    messages,
    isLoading,
    error,
    hasMoreOlder,
    isLoadingOlder,
    loadOlder,
    sendMessage,
    isSending,
    sendError,
    deleteMessage,
    notifyTyping,
    typingUsers: [...typingByUserId.values()],
  };
}
