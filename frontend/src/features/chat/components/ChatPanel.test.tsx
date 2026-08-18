import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { UseChatMessagesResult } from '../hooks';
import type { ChatMessage } from '../types';
import type { PinnedMessage } from '../../moderation/types';

const useChatMessagesMock = vi.hoisted(() => vi.fn());
vi.mock('../hooks', () => ({ useChatMessages: useChatMessagesMock }));

const usePinnedMessagesMock = vi.hoisted(() =>
  vi.fn(() => ({ data: [] as PinnedMessage[], isLoading: false, error: null, reload: vi.fn() })),
);
vi.mock('../../moderation/hooks', () => ({ usePinnedMessages: usePinnedMessagesMock }));

const moderationApiMocks = vi.hoisted(() => ({
  pinMessageRequest: vi.fn().mockResolvedValue(undefined),
  unpinMessageRequest: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../moderation/api', () => moderationApiMocks);

const { ChatPanel } = await import('./ChatPanel');

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
    created_at: '2026-07-20T18:30:00Z',
    ...overrides,
  };
}

function defaultResult(overrides: Partial<UseChatMessagesResult> = {}): UseChatMessagesResult {
  return {
    messages: [],
    isLoading: false,
    error: null,
    hasMoreOlder: false,
    isLoadingOlder: false,
    loadOlder: vi.fn(),
    sendMessage: vi.fn().mockResolvedValue(undefined),
    isSending: false,
    sendError: null,
    deleteMessage: vi.fn().mockResolvedValue(undefined),
    notifyTyping: vi.fn(),
    typingUsers: [],
    ...overrides,
  };
}

function renderPanel(overrides: Partial<UseChatMessagesResult> = {}, canModerate = false) {
  useChatMessagesMock.mockReturnValue(defaultResult(overrides));
  return render(
    <ChatPanel
      remateId="remate-1"
      subscribeToRealtime={() => () => {}}
      currentUserId="user-1"
      connectedUsers={3}
      canModerate={canModerate}
    />,
  );
}

describe('ChatPanel', () => {
  it('mientras carga el historial, muestra el spinner', () => {
    renderPanel({ isLoading: true });
    expect(screen.getByText('Cargando chat…')).toBeInTheDocument();
  });

  it('ante un error de historial, muestra el mensaje de error', () => {
    renderPanel({ error: { status: 500, code: 'http_error', message: 'Error.' } });
    expect(screen.getByText('No se pudo cargar el chat.')).toBeInTheDocument();
  });

  it('sin mensajes, muestra el estado vacío', () => {
    renderPanel();
    expect(screen.getByText('Sin mensajes todavía. ¡Sé el primero en escribir!')).toBeInTheDocument();
  });

  it('renderiza los mensajes recibidos y el contador de conectados', () => {
    renderPanel({ messages: [makeMessage({ id: 'msg-1', content: 'Hola' }), makeMessage({ id: 'msg-2', content: 'Buenas' })] });
    expect(screen.getByText('Hola')).toBeInTheDocument();
    expect(screen.getByText('Buenas')).toBeInTheDocument();
    expect(screen.getByText('3 conectados')).toBeInTheDocument();
  });

  it('agrupa mensajes consecutivos del mismo autor: el nombre solo se repite si cambia el autor', () => {
    // `author_id` distinto de `currentUserId` ("user-1", ver `renderPanel`) a propósito:
    // un mensaje propio nunca muestra su propio nombre (ver `ChatMessageItem`), así que
    // esta prueba de agrupado necesita autores que sean "otra persona" para poder
    // observar el nombre en el DOM.
    renderPanel({
      messages: [
        makeMessage({ id: 'msg-1', author_id: 'user-2', author_name: 'Juan', content: 'Hola', created_at: '2026-07-20T18:30:00Z' }),
        makeMessage({ id: 'msg-2', author_id: 'user-2', author_name: 'Juan', content: 'Cómo va', created_at: '2026-07-20T18:30:30Z' }),
        makeMessage({ id: 'msg-3', author_id: 'user-3', author_name: 'Pedro', content: 'Bien', created_at: '2026-07-20T18:31:00Z' }),
      ],
    });

    expect(screen.getAllByText('Juan')).toHaveLength(1);
    expect(screen.getByText('Pedro')).toBeInTheDocument();
    expect(screen.getByText('Hola')).toBeInTheDocument();
    expect(screen.getByText('Cómo va')).toBeInTheDocument();
    expect(screen.getByText('Bien')).toBeInTheDocument();
  });

  it('sin canModerate, no se puede eliminar ningún mensaje', () => {
    renderPanel({ messages: [makeMessage()] }, false);
    expect(screen.queryByRole('button', { name: 'Eliminar mensaje' })).not.toBeInTheDocument();
  });

  it('con canModerate, confirmar en el modal llama a deleteMessage con el id correcto', async () => {
    const deleteMessage = vi.fn().mockResolvedValue(undefined);
    renderPanel({ messages: [makeMessage({ id: 'msg-7' })], deleteMessage }, true);

    await userEvent.click(screen.getByRole('button', { name: 'Eliminar mensaje' }));
    expect(screen.getByRole('heading', { name: 'Eliminar mensaje' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Eliminar' }));
    expect(deleteMessage).toHaveBeenCalledWith('msg-7');
  });

  it('cancelar en el modal de confirmación no elimina el mensaje', async () => {
    const deleteMessage = vi.fn();
    renderPanel({ messages: [makeMessage({ id: 'msg-7' })], deleteMessage }, true);

    await userEvent.click(screen.getByRole('button', { name: 'Eliminar mensaje' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(deleteMessage).not.toHaveBeenCalled();
  });

  it('muestra el indicador de "está escribiendo" cuando hay usuarios tipeando', () => {
    renderPanel({ typingUsers: [{ user_id: 'user-2', user_name: 'Pedro', lastSeenAt: Date.now() }] });
    expect(screen.getByText('Pedro está escribiendo...')).toBeInTheDocument();
  });

  it('al hacer scroll cerca del final, no dispara loadOlder', () => {
    const loadOlder = vi.fn();
    renderPanel({
      messages: [makeMessage({ id: 'msg-1' })],
      hasMoreOlder: true,
      loadOlder,
    });

    const container = screen.getByText('Hola').closest('.flex-1') as HTMLElement;
    fireEvent.scroll(container, { target: { scrollTop: 500 } });

    expect(loadOlder).not.toHaveBeenCalled();
  });

  it('al hacer scroll cerca del principio con hasMoreOlder, dispara loadOlder', () => {
    const loadOlder = vi.fn();
    renderPanel({
      messages: [makeMessage({ id: 'msg-1' })],
      hasMoreOlder: true,
      isLoadingOlder: false,
      loadOlder,
    });

    // El contenedor con el listener de scroll es el que envuelve la lista de mensajes.
    const container = screen.getByText('Hola').closest('.flex-1') as HTMLElement;
    fireEvent.scroll(container, { target: { scrollTop: 10 } });

    expect(loadOlder).toHaveBeenCalledTimes(1);
  });

  it('no dispara loadOlder si ya está cargando mensajes anteriores', () => {
    const loadOlder = vi.fn();
    renderPanel({
      messages: [makeMessage({ id: 'msg-1' })],
      hasMoreOlder: true,
      isLoadingOlder: true,
      loadOlder,
    });

    const container = screen.getByText('Hola').closest('.flex-1') as HTMLElement;
    fireEvent.scroll(container, { target: { scrollTop: 10 } });

    expect(loadOlder).not.toHaveBeenCalled();
  });

  // --- Mensajes destacados (Épica 7, Módulo 7.6) ----------------------------------------

  it('sin canModerate, no muestra el botón de destacar', () => {
    renderPanel({ messages: [makeMessage()] }, false);
    expect(screen.queryByRole('button', { name: 'Destacar mensaje' })).not.toBeInTheDocument();
  });

  it('con canModerate, destacar un mensaje llama a pinMessageRequest', async () => {
    renderPanel({ messages: [makeMessage({ id: 'msg-7' })] }, true);

    await userEvent.click(screen.getByRole('button', { name: 'Destacar mensaje' }));

    expect(moderationApiMocks.pinMessageRequest).toHaveBeenCalledWith('remate-1', 'msg-7');
  });

  it('un mensaje ya destacado muestra el botón para quitar el destacado', async () => {
    usePinnedMessagesMock.mockReturnValueOnce({
      data: [
        {
          message_id: 'msg-7',
          content: 'Hola',
          author_name: 'Juan',
          pinned_by: 'rematador-1',
          pinned_at: '2026-07-20T18:31:00Z',
        },
      ],
      isLoading: false,
      error: null,
      reload: vi.fn(),
    });
    renderPanel({ messages: [makeMessage({ id: 'msg-7' })] }, true);

    const button = screen.getByRole('button', { name: 'Quitar destacado' });
    await userEvent.click(button);

    expect(moderationApiMocks.unpinMessageRequest).toHaveBeenCalledWith('remate-1', 'msg-7');
  });
});
