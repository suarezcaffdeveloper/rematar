import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { ConfirmModal } from '../../../shared/components/ConfirmModal';
import { Spinner } from '../../../shared/components/Spinner';
import { pinMessageRequest, unpinMessageRequest } from '../../moderation/api';
import { usePinnedMessages } from '../../moderation/hooks';
import { isModerationDomainEventMessage } from '../../moderation/realtime/events';
import { PresenceCounter } from '../../sala/components/PresenceCounter';
import { useChatMessages } from '../hooks';
import type { ChatMessage } from '../types';
import { ChatBubbleIcon } from './icons';
import { ChatInput } from './ChatInput';
import { ChatMessageItem } from './ChatMessageItem';
import { TypingIndicator } from './TypingIndicator';

const NEAR_BOTTOM_THRESHOLD_PX = 80;
const NEAR_TOP_THRESHOLD_PX = 60;

export interface ChatPanelProps {
  remateId: string;
  subscribeToRealtime: (listener: (message: unknown) => void) => () => void;
  currentUserId: string | undefined;
  connectedUsers: number;
  /** Solo el rematador dueño del remate puede moderar (eliminar mensajes) -- ver
   * `ChatService.delete_message`, backend, sin excepción para admin. */
  canModerate: boolean;
  /** Altura del panel -- `h-[32rem]` por default (uso apilado a ancho completo, ej.
   * Consola Operativa). Sala del Remate (Épica 9, Etapa 4) pasa `h-full` para que
   * ocupe el resto de su columna lateral en vez de una altura fija. */
  className?: string;
}

/**
 * Panel de chat del remate (Épica 6, Módulo 6.4) -- se integra tal cual en `SalaPage`
 * (comprador) y `ConsolaOperativaPage` (rematador, con `canModerate`). Reusa
 * `subscribeToRealtime` (expuesto por `useLiveRemateState`, `features/sala/hooks.ts`)
 * para no abrir una segunda conexión WebSocket, y `PresenceCounter`
 * (`features/sala/components/`) para "usuarios conectados al chat" -- mismo dato que ya
 * viaja en el snapshot, sin pedir nada nuevo al backend.
 */
export function ChatPanel({
  remateId,
  subscribeToRealtime,
  currentUserId,
  connectedUsers,
  canModerate,
  className,
}: ChatPanelProps) {
  const {
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
    typingUsers,
  } = useChatMessages(remateId, subscribeToRealtime, currentUserId);

  const [messageToDelete, setMessageToDelete] = useState<ChatMessage | null>(null);

  // Mensajes destacados (Épica 7, Módulo 7.6) -- solo se pide/renderiza el botón de
  // destacar cuando `canModerate` (mismo criterio que eliminar). El feature de chat no
  // conoce el backend de moderación: solo llama sus endpoints y escucha sus eventos de
  // dominio ya sincronizados por el pipeline existente, sin abrir una segunda conexión.
  const { data: pinnedMessages, reload: reloadPinnedMessages } = usePinnedMessages(
    canModerate ? remateId : '',
  );
  const pinnedMessageIds = new Set(pinnedMessages.map((pin) => pin.message_id));

  useEffect(() => {
    if (!canModerate) return;
    const unsubscribe = subscribeToRealtime((raw) => {
      if (!isModerationDomainEventMessage(raw)) return;
      if (
        raw.event_type === 'moderacion.mensaje_destacado' ||
        raw.event_type === 'moderacion.mensaje_no_destacado'
      ) {
        reloadPinnedMessages();
      }
    });
    return unsubscribe;
  }, [canModerate, subscribeToRealtime, reloadPinnedMessages]);

  async function handleTogglePin(message: ChatMessage) {
    if (pinnedMessageIds.has(message.id)) {
      await unpinMessageRequest(remateId, message.id);
    } else {
      await pinMessageRequest(remateId, message.id);
    }
    reloadPinnedMessages();
  }

  const containerRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const previousMessageCountRef = useRef(0);
  const isPrependingRef = useRef(false);
  const previousScrollHeightRef = useRef(0);

  // Scroll automático si estaba al final antes de que llegara el mensaje nuevo;
  // posición preservada si estaba leyendo mensajes anteriores (RF explícito del
  // enunciado). `useLayoutEffect`, no `useEffect`: necesita ajustar el scroll ANTES de
  // que el navegador pinte, para que no haya un parpadeo visible.
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    if (isPrependingRef.current) {
      el.scrollTop += el.scrollHeight - previousScrollHeightRef.current;
      isPrependingRef.current = false;
      previousMessageCountRef.current = messages.length;
      return;
    }

    const grew = messages.length > previousMessageCountRef.current;
    if (grew && isNearBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
    previousMessageCountRef.current = messages.length;
  }, [messages]);

  function handleScroll() {
    const el = containerRef.current;
    if (!el) return;
    isNearBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_THRESHOLD_PX;

    if (el.scrollTop < NEAR_TOP_THRESHOLD_PX && hasMoreOlder && !isLoadingOlder) {
      previousScrollHeightRef.current = el.scrollHeight;
      isPrependingRef.current = true;
      loadOlder();
    }
  }

  async function handleConfirmDelete() {
    if (!messageToDelete) return;
    await deleteMessage(messageToDelete.id);
    setMessageToDelete(null);
  }

  return (
    <div className={clsx('flex flex-col rounded-xl border border-slate-200 bg-white shadow-sm', className ?? 'h-[32rem]')}>
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <span className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <ChatBubbleIcon className="h-4 w-4 text-slate-400" />
          Chat del remate
        </span>
        <PresenceCounter count={connectedUsers} />
      </div>

      <div ref={containerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-2 py-2">
        {isLoadingOlder && (
          <div className="flex justify-center py-2">
            <Spinner size="sm" />
          </div>
        )}

        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <Spinner label="Cargando chat…" />
          </div>
        ) : error ? (
          <p className="p-4 text-center text-sm text-danger-600">No se pudo cargar el chat.</p>
        ) : messages.length === 0 ? (
          <p className="p-4 text-center text-sm text-slate-400">
            Sin mensajes todavía. ¡Sé el primero en escribir!
          </p>
        ) : (
          messages.map((message) => (
            <ChatMessageItem
              key={message.id}
              message={message}
              canModerate={canModerate}
              onRequestDelete={setMessageToDelete}
              isPinned={pinnedMessageIds.has(message.id)}
              onTogglePin={canModerate ? handleTogglePin : undefined}
            />
          ))
        )}
      </div>

      <TypingIndicator typingUsers={typingUsers} />
      <ChatInput onSend={sendMessage} onTyping={notifyTyping} isSending={isSending} sendError={sendError} />

      <ConfirmModal
        isOpen={messageToDelete !== null}
        onClose={() => setMessageToDelete(null)}
        onConfirm={handleConfirmDelete}
        title="Eliminar mensaje"
        message="El mensaje se va a marcar como eliminado para todos los conectados. Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        variant="danger"
      />
    </div>
  );
}
