import { memo } from 'react';
import clsx from 'clsx';
import { UserAvatar } from '../../../shared/components/UserAvatar';
import { formatTime } from '../../../shared/lib/format';
import type { ChatMessage } from '../types';
import { PinIcon, TrashIcon } from './icons';

/** Color del nombre según el rol de quien escribió (rediseño visual, Sala del Remate --
 * ver prototipo aprobado: filas planas con avatar, sin nubecita). Reemplaza el color de
 * FONDO que tenía antes cada nubecita -- la distinción rematador/comprador/admin sigue
 * existiendo (pedido original: "que se distinga de un vistazo, sin tener que leer
 * ninguna etiqueta"), ahora en el nombre en vez de en un fondo de color. Solo aplica a
 * mensajes ajenos -- los propios (`isOwnMessage`) siguen sin mostrar nombre (ver más
 * abajo) y se distinguen por el color del texto del mensaje. */
const NON_OWN_NAME_CLASSES: Record<NonNullable<ChatMessage['author_role']>, string> = {
  comprador: 'text-ink-muted',
  rematador: 'text-sky-700',
  admin: 'text-amber-700',
};

export interface ChatMessageItemProps {
  message: ChatMessage;
  canModerate: boolean;
  onRequestDelete: (message: ChatMessage) => void;
  /** Épica 7, Módulo 7.6 -- si el mensaje está destacado (anuncio del rematador). */
  isPinned?: boolean;
  /** `false` cuando este mensaje es una continuación del anterior (mismo autor, poca
   * diferencia de tiempo -- ver `isGroupedWithPrevious` en `ChatPanel.tsx`): oculta el
   * avatar/nombre para que una tanda de mensajes seguidos de la misma persona se lea
   * como un solo bloque, en vez de repetirlos en cada uno -- mismo criterio que agrupa
   * mensajes cualquier chat (WhatsApp/Slack/Discord). Default `true`: sin agrupar, se ve
   * exactamente como antes.
   */
  showHeader?: boolean;
  /** Sin definir cuando el viewer no puede moderar -- mismo criterio que `canDelete`. */
  onTogglePin?: (message: ChatMessage) => void;
  /** `true` cuando `message.author_id` es el usuario que está mirando el chat -- se
   * distingue por el color del texto del mensaje y omite el nombre (es obvio que sos
   * vos). Default `false`: se ve como el mensaje de cualquier otro participante. */
  isOwnMessage?: boolean;
}

/**
 * Un mensaje del chat -- de usuario (avatar + nombre + texto, en fila) o de sistema
 * (centrado, sin avatar/nombre, estilo diferenciado a propósito). `memo`: un mensaje
 * nuevo al final no debería re-renderizar los que ya estaban, mismo criterio que
 * `OfferHistoryEntry`/`UpcomingLoteCard`.
 *
 * Fila plana, sin nubecita (rediseño visual, Sala del Remate -- ver prototipo aprobado,
 * pedido explícito de sacar la nubecita): avatar (`UserAvatar`, foto de perfil elegida
 * o iniciales si no tiene una) + nombre arriba del texto (no adentro de un contenedor
 * de color) -- mismo lenguaje que el resto del Design System nuevo (`OfferHistoryList`,
 * sin cards/nubecitas, solo tipografía y espacio). El nombre solo se muestra en la
 * primera fila de una tanda consecutiva del mismo autor (`showHeader`) y nunca para
 * mensajes propios (ver `isOwnMessage`) -- ambos comportamientos ya existían con la
 * nubecita vieja, se conservan tal cual.
 */
export const ChatMessageItem = memo(function ChatMessageItem({
  message,
  canModerate,
  onRequestDelete,
  isPinned = false,
  showHeader = true,
  onTogglePin,
  isOwnMessage = false,
}: ChatMessageItemProps) {
  if (message.kind === 'system') {
    return (
      <div className="flex justify-center py-1">
        <span className="rounded-full bg-surface-subtle px-3 py-1 text-center text-xs text-ink-faint">
          {message.content}
          <span className="ml-1.5 text-ink-faint">{formatTime(message.created_at)}</span>
        </span>
      </div>
    );
  }

  const canDelete = canModerate && !message.is_deleted;
  const canPin = Boolean(onTogglePin) && !message.is_deleted;
  const hasActions = canPin || canDelete;
  const showName = showHeader && !isOwnMessage;

  const actions = hasActions && (
    <div className="flex shrink-0 items-start gap-0.5 pt-0.5 opacity-0 transition-opacity group-hover:opacity-100">
      {canPin && (
        <button
          type="button"
          onClick={() => onTogglePin?.(message)}
          aria-label={isPinned ? 'Quitar destacado' : 'Destacar mensaje'}
          className={clsx(
            'rounded p-1 hover:bg-brand-50 hover:text-brand-600',
            isPinned ? 'text-brand-500' : 'text-ink-faint',
          )}
        >
          <PinIcon className="h-3.5 w-3.5" />
        </button>
      )}
      {canDelete && (
        <button
          type="button"
          onClick={() => onRequestDelete(message)}
          aria-label="Eliminar mensaje"
          className="rounded p-1 text-ink-faint hover:bg-danger-50 hover:text-danger-600"
        >
          <TrashIcon className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );

  return (
    <div className={clsx('group flex gap-2.5 px-1', showHeader ? 'mt-3' : 'mt-1')}>
      {showHeader ? (
        <UserAvatar avatarUrl={message.author_avatar_url} fullName={message.author_name ?? '?'} size="xs" />
      ) : (
        <div className="w-7 shrink-0" aria-hidden="true" />
      )}

      <div className="min-w-0 grow">
        {showName && (
          <div className="flex flex-wrap items-center gap-1.5">
            {isPinned && <PinIcon className="h-3.5 w-3.5 shrink-0 text-brand-500" />}
            <span
              className={clsx(
                'text-xs font-semibold',
                message.author_role ? NON_OWN_NAME_CLASSES[message.author_role] : 'text-ink',
              )}
            >
              {message.author_name}
            </span>
          </div>
        )}

        <p
          className={clsx(
            'text-sm leading-snug',
            message.is_deleted ? 'italic text-ink-faint' : isOwnMessage ? 'text-brand-700' : 'text-ink-muted',
          )}
        >
          {message.is_deleted ? 'Mensaje eliminado' : message.content}
          <span className="ml-2 inline-block align-bottom whitespace-nowrap text-[10px] text-ink-faint">
            {formatTime(message.created_at)}
          </span>
        </p>
      </div>

      {actions}
    </div>
  );
});
