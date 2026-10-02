import { useCallback, useMemo, useState } from 'react';
import { useChatMessages } from '../../../chat/hooks';
import type { ChatMessage } from '../../../chat/types';

export interface BuyerQuestion {
  id: string;
  authorName: string;
  text: string;
  createdAt: string;
  /** Texto de la respuesta si la empresa (o el martillero) ya respondió, si no `null`. */
  answer: string | null;
}

/**
 * Bandeja de preguntas de la empresa. El backend no distingue "pregunta" de "mensaje": se
 * considera pregunta todo mensaje de un comprador (no borrado) que contiene un "?". Responder
 * es mandar un mensaje al chat que arranca con `@nombre` -- así el comprador ve a quién le
 * contestan y la bandeja puede dar la pregunta por respondida aunque la respuesta la haya
 * escrito el martillero desde el chat (cualquier mensaje posterior de un no-comprador que
 * mencione `@nombre`). Las descartadas solo se ocultan en este navegador.
 */
export function useBuyerQuestions(
  remateId: string,
  subscribeToRealtime: (listener: (message: unknown) => void) => () => void,
  currentUserId: string | undefined,
) {
  const { messages, sendMessage, isSending, sendError } = useChatMessages(remateId, subscribeToRealtime, currentUserId);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [replied, setReplied] = useState<Record<string, string>>({});

  const questions = useMemo<BuyerQuestion[]>(() => {
    const result: BuyerQuestion[] = [];
    messages.forEach((message: ChatMessage, index) => {
      if (message.kind !== 'user' || message.is_deleted || message.author_role !== 'comprador') return;
      if (!message.content?.includes('?') || dismissed.includes(message.id)) return;
      const mention = `@${message.author_name ?? ''}`;
      const staffReply = messages
        .slice(index + 1)
        .find((m) => m.kind === 'user' && !m.is_deleted && m.author_role !== 'comprador' && m.author_name !== null && m.content?.startsWith(mention));
      result.push({
        id: message.id,
        authorName: message.author_name ?? 'Comprador',
        text: message.content,
        createdAt: message.created_at,
        answer: replied[message.id] ?? staffReply?.content?.slice(mention.length).trim() ?? null,
      });
    });
    return result;
  }, [messages, dismissed, replied]);

  const pending = useMemo(() => questions.filter((q) => q.answer === null), [questions]);

  const reply = useCallback(
    async (question: BuyerQuestion, text: string) => {
      const clean = text.trim();
      if (!clean) return;
      await sendMessage(`@${question.authorName} ${clean}`);
      setReplied((prev) => ({ ...prev, [question.id]: clean }));
    },
    [sendMessage],
  );

  const dismiss = useCallback((id: string) => setDismissed((list) => [...list, id]), []);

  return { questions, pending, reply, dismiss, isSending, sendError };
}

export type BuyerQuestions = ReturnType<typeof useBuyerQuestions>;
