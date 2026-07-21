import { useState, type KeyboardEvent } from 'react';
import clsx from 'clsx';
import type { NormalizedApiError } from '../../../shared/api/errors';
import { SendIcon } from './icons';

const MAX_LENGTH = 500; // espejo de `settings.CHAT_MESSAGE_MAX_LENGTH` (backend, valor por default)

export interface ChatInputProps {
  onSend: (content: string) => Promise<void>;
  onTyping: () => void;
  isSending: boolean;
  sendError: NormalizedApiError | null;
}

/** Caja de envío: contador de caracteres, Enter para enviar (Shift+Enter para salto de
 * línea), deshabilitada mientras envía o si el contenido está vacío/excede el máximo.
 * `onTyping` se llama en cada tecla -- el throttle real (cliente + rate limit del
 * backend) vive en `useChatMessages`, acá no hace falta duplicar esa lógica. */
export function ChatInput({ onSend, onTyping, isSending, sendError }: ChatInputProps) {
  const [value, setValue] = useState('');

  const trimmed = value.trim();
  const overLimit = value.length > MAX_LENGTH;
  const canSend = trimmed.length > 0 && !overLimit && !isSending;

  async function handleSend() {
    if (!canSend) return;
    const content = trimmed;
    setValue('');
    try {
      await onSend(content);
    } catch {
      setValue(content); // se perdió el envío -- no se descarta lo que la persona escribió
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  }

  return (
    <div className="flex flex-col gap-1.5 border-t border-slate-200 p-3">
      {sendError && <p className="text-xs text-danger-600">{sendError.message}</p>}
      <div className="flex items-end gap-2">
        <textarea
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            onTyping();
          }}
          onKeyDown={handleKeyDown}
          placeholder="Escribí un mensaje..."
          rows={1}
          className="max-h-24 min-h-[2.5rem] flex-1 resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
        <button
          type="button"
          onClick={() => void handleSend()}
          disabled={!canSend}
          aria-label="Enviar mensaje"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          <SendIcon className="h-4 w-4" />
        </button>
      </div>
      <span className={clsx('self-end text-xs', overLimit ? 'text-danger-600' : 'text-slate-400')}>
        {value.length}/{MAX_LENGTH}
      </span>
    </div>
  );
}
