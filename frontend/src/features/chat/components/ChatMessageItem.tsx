import { memo } from 'react';
import clsx from 'clsx';
import { formatTime } from '../../../shared/lib/format';
import type { ChatMessage } from '../types';
import { PinIcon, TrashIcon } from './icons';

/** Color de la nubecita según el rol de quien escribió -- reemplaza la chip de texto
 * "Comprador"/"Rematador"/"Administrador" que había antes (pedido explícito: sacarla
 * del todo). Un comprador se ve exactamente como siempre (gris); el rematador que
 * gestiona el remate se destaca en celeste para que se distinga de un vistazo, sin
 * tener que leer ninguna etiqueta. Solo aplica a mensajes ajenos -- los propios
 * (`isOwnMessage`) siguen siempre con el color de marca, sin importar el rol. */
const NON_OWN_BUBBLE_CLASSES: Record<NonNullable<ChatMessage['author_role']>, string> = {
  comprador: 'bg-slate-100 text-slate-800',
  rematador: 'bg-sky-100 text-sky-900',
  admin: 'bg-amber-100 text-amber-900',
};

const NON_OWN_NAME_CLASSES: Record<NonNullable<ChatMessage['author_role']>, string> = {
  comprador: 'text-slate-600',
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
   * encabezado (nombre/rol) para que una tanda de mensajes seguidos de la misma persona
   * se lea como un solo bloque, en vez de repetir el nombre en cada uno -- mismo criterio
   * que agrupa mensajes cualquier chat (WhatsApp/Slack/Discord). Default `true`: sin
   * agrupar, se ve exactamente como antes. */
  showHeader?: boolean;
  /** Sin definir cuando el viewer no puede moderar -- mismo criterio que `canDelete`. */
  onTogglePin?: (message: ChatMessage) => void;
  /** `true` cuando `message.author_id` es el usuario que está mirando el chat -- alinea
   * la nubecita a la derecha con el color de marca y omite el nombre (es obvio que sos
   * vos), mismo lenguaje visual que cualquier chat conocido (WhatsApp/Telegram/iMessage).
   * Default `false`: se ve como el mensaje de cualquier otro participante. */
  isOwnMessage?: boolean;
}

/** Un mensaje del chat -- de usuario (nubecita con nombre/hora adentro) o de sistema
 * (centrado, sin nombre/rol/nubecita, estilo diferenciado a propósito -- pedido
 * explícito del enunciado). `memo`: un mensaje nuevo al final no debería re-renderizar
 * los que ya estaban, mismo criterio que `OfferHistoryEntry`/`UpcomingLoteCard`.
 *
 * Rediseño "nubecita" (pedido explícito, con una captura de Telegram como referencia de
 * estructura -- NO de color, que se mantiene el mismo gris ya usado): nombre y hora
 * viven DENTRO de la nubecita, pegados al texto del mensaje -- no arriba/abajo de ella
 * como en la primera iteración de este rediseño. El nombre solo se muestra en la
 * primera nubecita de una tanda consecutiva del mismo autor (`showHeader`); cada
 * nubecita, agrupada o no, sigue mostrando su propia hora. Alineado a la derecha con
 * fondo de marca para los mensajes propios (`isOwnMessage`), a la izquierda con fondo
 * gris claro para el resto -- la posición ya alcanza para diferenciar "qué escribiste
 * vos" de "qué escribió cada otra persona" de un vistazo. */
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
        <span className="rounded-full bg-slate-100 px-3 py-1 text-center text-xs text-slate-500">
          {message.content}
          <span className="ml-1.5 text-slate-400">{formatTime(message.created_at)}</span>
        </span>
      </div>
    );
  }

  const canDelete = canModerate && !message.is_deleted;
  const canPin = Boolean(onTogglePin) && !message.is_deleted;
  const hasActions = canPin || canDelete;

  const actions = hasActions && (
    <div className="flex shrink-0 gap-0.5 self-end opacity-0 transition-opacity group-hover:opacity-100">
      {canPin && (
        <button
          type="button"
          onClick={() => onTogglePin?.(message)}
          aria-label={isPinned ? 'Quitar destacado' : 'Destacar mensaje'}
          className={clsx(
            'rounded p-1 hover:bg-brand-50 hover:text-brand-600',
            isPinned ? 'text-brand-500' : 'text-slate-400',
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
          className="rounded p-1 text-slate-400 hover:bg-danger-50 hover:text-danger-600"
        >
          <TrashIcon className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );

  return (
    <div className={clsx('group flex px-1', showHeader ? 'mt-2.5' : 'mt-1.5', isOwnMessage && 'justify-end')}>
      <div className="flex max-w-[85%] items-end gap-1 sm:max-w-[75%]">
        {isOwnMessage && actions}
        <div
          className={clsx(
            'flex flex-col rounded-2xl px-3 py-2 text-sm shadow-sm',
            isOwnMessage
              ? 'rounded-br-sm bg-brand-600 text-white'
              : clsx(
                  'rounded-bl-sm',
                  message.author_role ? NON_OWN_BUBBLE_CLASSES[message.author_role] : 'bg-slate-100 text-slate-800',
                ),
            isPinned && !isOwnMessage && 'ring-2 ring-brand-300',
          )}
        >
          {showHeader && !isOwnMessage && (
            <div className="mb-0.5 flex flex-wrap items-center gap-1.5">
              {isPinned && <PinIcon className="h-3.5 w-3.5 shrink-0 text-brand-500" />}
              <span
                className={clsx(
                  'text-xs font-semibold',
                  message.author_role ? NON_OWN_NAME_CLASSES[message.author_role] : 'text-slate-600',
                )}
              >
                {message.author_name}
              </span>
            </div>
          )}

          <p className={clsx('break-words', message.is_deleted && 'italic opacity-75')}>
            {message.is_deleted ? 'Mensaje eliminado' : message.content}
            <span
              className={clsx(
                'ml-2 inline-block align-bottom text-[10px] leading-none whitespace-nowrap',
                isOwnMessage ? 'text-brand-100' : 'text-slate-400',
              )}
            >
              {formatTime(message.created_at)}
            </span>
          </p>
        </div>
        {!isOwnMessage && actions}
      </div>
    </div>
  );
});
