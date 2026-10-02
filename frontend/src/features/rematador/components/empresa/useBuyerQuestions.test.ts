import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { ChatMessage } from '../../../chat/types';
import { useBuyerQuestions } from './useBuyerQuestions';

const { useChatMessagesMock } = vi.hoisted(() => ({ useChatMessagesMock: vi.fn() }));
vi.mock('../../../chat/hooks', () => ({ useChatMessages: useChatMessagesMock }));

function msg(overrides: Partial<ChatMessage>): ChatMessage {
  return {
    id: 'm',
    remate_id: 'r1',
    kind: 'user',
    author_id: 'u1',
    author_name: 'Comprador 14',
    author_role: 'comprador',
    author_avatar_url: null,
    content: 'hola',
    system_event_type: null,
    is_deleted: false,
    created_at: '2026-07-18T10:00:00Z',
    ...overrides,
  };
}

function mockMessages(messages: ChatMessage[], sendMessage = vi.fn().mockResolvedValue(undefined)) {
  useChatMessagesMock.mockReturnValue({ messages, sendMessage, isSending: false, sendError: null });
  return sendMessage;
}

function render() {
  return renderHook(() => useBuyerQuestions('r1', () => () => {}, 'owner-1'));
}

describe('useBuyerQuestions', () => {
  beforeEach(() => useChatMessagesMock.mockReset());

  it('solo cuenta como pregunta un mensaje de comprador, no borrado, con "?"', () => {
    mockMessages([
      msg({ id: 'a', content: '¿Tiene garantía?' }),
      msg({ id: 'b', content: 'Buenas tardes' }),
      msg({ id: 'c', content: '¿Borrada?', is_deleted: true }),
      msg({ id: 'd', content: '¿Del martillero?', author_role: 'rematador', author_name: 'Mart' }),
      msg({ id: 'e', kind: 'system', content: '¿Sistema?', author_role: null }),
    ]);
    const { result } = render();
    expect(result.current.questions.map((q) => q.id)).toEqual(['a']);
    expect(result.current.pending).toHaveLength(1);
  });

  it('una respuesta posterior de la empresa o el martillero que menciona al comprador la da por respondida', () => {
    mockMessages([
      msg({ id: 'a', content: '¿Tiene garantía?' }),
      msg({ id: 'r', author_id: 'm1', author_name: 'Mart', author_role: 'rematador', content: '@Comprador 14 Sí, 30 días.' }),
    ]);
    const { result } = render();
    expect(result.current.pending).toHaveLength(0);
    expect(result.current.questions[0].answer).toBe('Sí, 30 días.');
  });

  it('responder manda "@nombre texto" al chat y la pregunta deja de estar pendiente', async () => {
    const sendMessage = mockMessages([msg({ id: 'a', content: '¿Tiene garantía?' })]);
    const { result } = render();

    await act(async () => {
      await result.current.reply(result.current.questions[0], 'Sí, incluida.');
    });

    expect(sendMessage).toHaveBeenCalledWith('@Comprador 14 Sí, incluida.');
    expect(result.current.pending).toHaveLength(0);
  });

  it('descartar oculta la pregunta', () => {
    mockMessages([msg({ id: 'a', content: '¿Tiene garantía?' })]);
    const { result } = render();
    act(() => result.current.dismiss('a'));
    expect(result.current.questions).toHaveLength(0);
  });
});
