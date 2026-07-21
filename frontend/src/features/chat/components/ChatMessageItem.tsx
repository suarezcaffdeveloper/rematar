import { memo } from 'react';
import clsx from 'clsx';
import { Badge } from '../../../shared/components/Badge';
import { formatTime } from '../../../shared/lib/format';
import { CHAT_ROLE_LABELS } from '../labels';
import type { ChatMessage } from '../types';
import { TrashIcon } from './icons';

const ROLE_BADGE_VARIANTS: Record<NonNullable<ChatMessage['author_role']>, 'brand' | 'warning' | 'neutral'> = {
  comprador: 'neutral',
  rematador: 'brand',
  admin: 'warning',
};

export interface ChatMessageItemProps {
  message: ChatMessage;
  canModerate: boolean;
  onRequestDelete: (message: ChatMessage) => void;
}

/** Un mensaje del chat -- de usuario (nombre, rol, hora, contenido) o de sistema
 * (centrado, sin nombre/rol/avatar, estilo diferenciado a propósito -- pedido explícito
 * del enunciado). `memo`: un mensaje nuevo al final no debería re-renderizar los que ya
 * estaban, mismo criterio que `OfferHistoryEntry`/`UpcomingLoteCard` (Épica 4.5). */
export const ChatMessageItem = memo(function ChatMessageItem({
  message,
  canModerate,
  onRequestDelete,
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

  return (
    <div className="group flex flex-col gap-0.5 rounded-lg px-2 py-1.5 hover:bg-slate-50">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-sm font-semibold text-slate-800">{message.author_name}</span>
        {message.author_role && (
          <Badge variant={ROLE_BADGE_VARIANTS[message.author_role]}>
            {CHAT_ROLE_LABELS[message.author_role]}
          </Badge>
        )}
        <span className="text-xs text-slate-400">{formatTime(message.created_at)}</span>
        {canDelete && (
          <button
            type="button"
            onClick={() => onRequestDelete(message)}
            aria-label="Eliminar mensaje"
            className="ml-auto hidden shrink-0 rounded p-1 text-slate-400 opacity-0 transition-opacity hover:bg-danger-50 hover:text-danger-600 group-hover:opacity-100 sm:inline-flex"
          >
            <TrashIcon className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <p className={clsx('break-words text-sm', message.is_deleted ? 'italic text-slate-400' : 'text-slate-700')}>
        {message.is_deleted ? 'Mensaje eliminado' : message.content}
      </p>
    </div>
  );
});
