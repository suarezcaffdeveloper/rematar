import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ChatMessage } from './types';

const apiMocks = vi.hoisted(() => ({
  fetchChatMessagesRequest: vi.fn(),
  sendChatMessageRequest: vi.fn(),
  deleteChatMessageRequest: vi.fn(),
  notifyChatTypingRequest: vi.fn(),
}));

vi.mock('./api', () => apiMocks);

const { useChatMessages } = await import('./hooks');

function makeMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'msg-1',
    remate_id: 'remate-1',
    kind: 'user',
    author_id: 'user-1',
    author_name: 'Juan',
    author_role: 'comprador',
    author_avatar_url: null,
    content: 'Hola',
    system_event_type: null,
    is_deleted: false,
    created_at: '2026-07-20T10:00:00Z',
    ...overrides,
  };
}

/** Emula el `subscribeToRealtime` de `useLiveRemateState` -- guarda el listener para
 * poder emitir mensajes de dominio_event a mano desde cada test. */
function makeRealtimeStub() {
  const listeners: Array<(message: unknown) => void> = [];
  const subscribeToRealtime = vi.fn((listener: (message: unknown) => void) => {
    listeners.push(listener);
    return () => {
      const index = listeners.indexOf(listener);
      if (index !== -1) listeners.splice(index, 1);
    };
  });
  return {
    subscribeToRealtime,
    emit: (message: unknown) => listeners.forEach((listener) => listener(message)),
  };
}

describe('useChatMessages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.fetchChatMessagesRequest.mockResolvedValue([]);
  });

  it('carga el historial inicial y expone isLoading', async () => {
    apiMocks.fetchChatMessagesRequest.mockResolvedValue([makeMessage()]);
    const { subscribeToRealtime } = makeRealtimeStub();

    const { result } = renderHook(() => useChatMessages('remate-1', subscribeToRealtime, 'user-1'));

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.messages).toHaveLength(1);
    expect(apiMocks.fetchChatMessagesRequest).toHaveBeenCalledWith('remate-1');
  });

  it('ante un error de historial, expone el error normalizado', async () => {
    apiMocks.fetchChatMessagesRequest.mockRejectedValue({
      isAxiosError: true,
      response: { status: 500, data: { error: { code: 'http_error', message: 'Error del servidor.' } } },
    });
    const { subscribeToRealtime } = makeRealtimeStub();

    const { result } = renderHook(() => useChatMessages('remate-1', subscribeToRealtime, 'user-1'));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error?.message).toBe('Error del servidor.');
  });

  it('chat.message_sent en vivo agrega el mensaje sin duplicar', async () => {
    const { subscribeToRealtime, emit } = makeRealtimeStub();
    const { result } = renderHook(() => useChatMessages('remate-1', subscribeToRealtime, 'user-1'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      emit({
        type: 'domain_event',
        event_type: 'chat.message_sent',
        payload: {
          event_type: 'chat.message_sent',
          event_id: 'e1',
          remate_id: 'remate-1',
          occurred_at: '2026-07-20T10:01:00Z',
          message_id: 'msg-2',
          kind: 'user',
          author_id: 'user-2',
          author_name: 'Pedro',
          author_role: 'comprador',
          author_avatar_url: 'https://cdn.example.com/pedro.jpg',
          content: 'Buenas',
          system_event_type: null,
          created_at: '2026-07-20T10:01:00Z',
        },
      });
    });

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].content).toBe('Buenas');
    expect(result.current.messages[0].author_avatar_url).toBe('https://cdn.example.com/pedro.jpg');
  });

  it('ignora mensajes que no son eventos de dominio de chat', async () => {
    const { subscribeToRealtime, emit } = makeRealtimeStub();
    const { result } = renderHook(() => useChatMessages('remate-1', subscribeToRealtime, 'user-1'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      emit({ type: 'domain_event', event_type: 'oferta.accepted', payload: {} });
      emit({ type: 'snapshot', data: {} });
    });

    expect(result.current.messages).toHaveLength(0);
  });

  it('chat.message_deleted marca el mensaje existente como eliminado, sin quitarlo de la lista', async () => {
    apiMocks.fetchChatMessagesRequest.mockResolvedValue([makeMessage({ id: 'msg-1', content: 'Hola' })]);
    const { subscribeToRealtime, emit } = makeRealtimeStub();
    const { result } = renderHook(() => useChatMessages('remate-1', subscribeToRealtime, 'user-1'));
    await waitFor(() => expect(result.current.messages).toHaveLength(1));

    act(() => {
      emit({
        type: 'domain_event',
        event_type: 'chat.message_deleted',
        payload: {
          event_type: 'chat.message_deleted',
          event_id: 'e2',
          remate_id: 'remate-1',
          occurred_at: '2026-07-20T10:02:00Z',
          message_id: 'msg-1',
        },
      });
    });

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].is_deleted).toBe(true);
    expect(result.current.messages[0].content).toBeNull();
  });

  it('chat.user_typing agrega al usuario a typingUsers, salvo que sea uno mismo', async () => {
    const { subscribeToRealtime, emit } = makeRealtimeStub();
    const { result } = renderHook(() => useChatMessages('remate-1', subscribeToRealtime, 'user-1'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      emit({
        type: 'domain_event',
        event_type: 'chat.user_typing',
        payload: {
          event_type: 'chat.user_typing',
          event_id: 'e3',
          remate_id: 'remate-1',
          occurred_at: '2026-07-20T10:03:00Z',
          user_id: 'user-2',
          user_name: 'Pedro',
        },
      });
    });
    expect(result.current.typingUsers.map((u) => u.user_id)).toEqual(['user-2']);

    act(() => {
      emit({
        type: 'domain_event',
        event_type: 'chat.user_typing',
        payload: {
          event_type: 'chat.user_typing',
          event_id: 'e4',
          remate_id: 'remate-1',
          occurred_at: '2026-07-20T10:03:00Z',
          user_id: 'user-1',
          user_name: 'Yo',
        },
      });
    });
    expect(result.current.typingUsers.map((u) => u.user_id)).toEqual(['user-2']);
  });

  it('chat.message_sent de un usuario que estaba "escribiendo" lo saca de typingUsers', async () => {
    const { subscribeToRealtime, emit } = makeRealtimeStub();
    const { result } = renderHook(() => useChatMessages('remate-1', subscribeToRealtime, 'user-1'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      emit({
        type: 'domain_event',
        event_type: 'chat.user_typing',
        payload: {
          event_type: 'chat.user_typing',
          event_id: 'e3',
          remate_id: 'remate-1',
          occurred_at: 't',
          user_id: 'user-2',
          user_name: 'Pedro',
        },
      });
    });
    expect(result.current.typingUsers).toHaveLength(1);

    act(() => {
      emit({
        type: 'domain_event',
        event_type: 'chat.message_sent',
        payload: {
          event_type: 'chat.message_sent',
          event_id: 'e5',
          remate_id: 'remate-1',
          occurred_at: 't',
          message_id: 'msg-3',
          kind: 'user',
          author_id: 'user-2',
          author_name: 'Pedro',
          author_role: 'comprador',
          author_avatar_url: null,
          content: 'Ya termino',
          system_event_type: null,
          created_at: 't',
        },
      });
    });

    expect(result.current.typingUsers).toHaveLength(0);
  });

  it('sendMessage manda el contenido y agrega el mensaje devuelto por el backend', async () => {
    const sent = makeMessage({ id: 'msg-9', content: 'Enviado' });
    apiMocks.sendChatMessageRequest.mockResolvedValue(sent);
    const { subscribeToRealtime } = makeRealtimeStub();
    const { result } = renderHook(() => useChatMessages('remate-1', subscribeToRealtime, 'user-1'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.sendMessage('Enviado');
    });

    expect(apiMocks.sendChatMessageRequest).toHaveBeenCalledWith('remate-1', 'Enviado');
    expect(result.current.messages.map((m) => m.id)).toContain('msg-9');
    expect(result.current.sendError).toBeNull();
  });

  it('sendMessage ante un error expone sendError y relanza', async () => {
    apiMocks.sendChatMessageRequest.mockRejectedValue({
      isAxiosError: true,
      response: { status: 429, data: { error: { code: 'rate_limited', message: 'Estás enviando mensajes muy rápido.' } } },
    });
    const { subscribeToRealtime } = makeRealtimeStub();
    const { result } = renderHook(() => useChatMessages('remate-1', subscribeToRealtime, 'user-1'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await expect(result.current.sendMessage('Muy rápido')).rejects.toBeDefined();
    });

    expect(result.current.sendError?.message).toBe('Estás enviando mensajes muy rápido.');
  });

  it('deleteMessage llama al backend y actualiza el mensaje con lo devuelto', async () => {
    apiMocks.fetchChatMessagesRequest.mockResolvedValue([makeMessage({ id: 'msg-1' })]);
    apiMocks.deleteChatMessageRequest.mockResolvedValue(
      makeMessage({ id: 'msg-1', is_deleted: true, content: null }),
    );
    const { subscribeToRealtime } = makeRealtimeStub();
    const { result } = renderHook(() => useChatMessages('remate-1', subscribeToRealtime, 'user-1'));
    await waitFor(() => expect(result.current.messages).toHaveLength(1));

    await act(async () => {
      await result.current.deleteMessage('msg-1');
    });

    expect(apiMocks.deleteChatMessageRequest).toHaveBeenCalledWith('remate-1', 'msg-1');
    expect(result.current.messages[0].is_deleted).toBe(true);
  });

  it('notifyTyping throttlea llamadas consecutivas del lado del cliente', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    apiMocks.notifyChatTypingRequest.mockResolvedValue(undefined);
    const { subscribeToRealtime } = makeRealtimeStub();
    const { result } = renderHook(() => useChatMessages('remate-1', subscribeToRealtime, 'user-1'));

    act(() => {
      result.current.notifyTyping();
      result.current.notifyTyping();
      result.current.notifyTyping();
    });

    expect(apiMocks.notifyChatTypingRequest).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('loadOlder antepone mensajes más viejos y no vuelve a pedir si ya no hay más', async () => {
    apiMocks.fetchChatMessagesRequest.mockResolvedValueOnce([
      makeMessage({ id: 'msg-2', created_at: '2026-07-20T10:02:00Z' }),
    ]);
    const { subscribeToRealtime } = makeRealtimeStub();
    const { result } = renderHook(() => useChatMessages('remate-1', subscribeToRealtime, 'user-1'));
    await waitFor(() => expect(result.current.messages).toHaveLength(1));

    apiMocks.fetchChatMessagesRequest.mockResolvedValueOnce([
      makeMessage({ id: 'msg-1', created_at: '2026-07-20T10:01:00Z' }),
    ]);

    act(() => {
      result.current.loadOlder();
    });

    await waitFor(() => expect(result.current.messages).toHaveLength(2));
    expect(result.current.messages.map((m) => m.id)).toEqual(['msg-1', 'msg-2']);
    expect(apiMocks.fetchChatMessagesRequest).toHaveBeenLastCalledWith('remate-1', {
      beforeCreatedAt: '2026-07-20T10:02:00Z',
      beforeId: 'msg-2',
    });

    apiMocks.fetchChatMessagesRequest.mockResolvedValueOnce([]);
    act(() => {
      result.current.loadOlder();
    });
    await waitFor(() => expect(result.current.hasMoreOlder).toBe(false));
  });
});
