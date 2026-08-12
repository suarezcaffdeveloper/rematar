import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatMessageItem } from './ChatMessageItem';
import type { ChatMessage } from '../types';

function makeMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'msg-1',
    remate_id: 'remate-1',
    kind: 'user',
    author_id: 'user-1',
    author_name: 'Juan Pérez',
    author_role: 'comprador',
    content: 'Hola a todos',
    system_event_type: null,
    is_deleted: false,
    created_at: '2026-07-20T18:30:00Z',
    ...overrides,
  };
}

describe('ChatMessageItem', () => {
  it('mensaje de sistema: se renderiza centrado, sin nombre/rol ni botón de borrado', () => {
    render(
      <ChatMessageItem
        message={makeMessage({ kind: 'system', content: 'El remate comenzó.', author_id: null, author_name: null, author_role: null })}
        canModerate
        onRequestDelete={vi.fn()}
      />,
    );

    expect(screen.getByText('El remate comenzó.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Eliminar mensaje' })).not.toBeInTheDocument();
  });

  it('mensaje de usuario: muestra nombre y contenido, sin ninguna chip de texto de rol', () => {
    render(<ChatMessageItem message={makeMessage()} canModerate={false} onRequestDelete={vi.fn()} />);

    expect(screen.getByText('Juan Pérez')).toBeInTheDocument();
    expect(screen.getByText('Hola a todos')).toBeInTheDocument();
    expect(screen.queryByText('Comprador')).not.toBeInTheDocument();
    expect(screen.queryByText('Rematador')).not.toBeInTheDocument();
  });

  it('un mensaje de un bot no muestra el globito "Simulador" (pedido explícito de sacarlo)', () => {
    render(
      <ChatMessageItem message={makeMessage({ is_bot: true })} canModerate={false} onRequestDelete={vi.fn()} />,
    );
    expect(screen.queryByText('Simulador')).not.toBeInTheDocument();
  });

  // --- Color de la nubecita según el rol (reemplaza la chip de texto de rol) -----------

  it('un mensaje de un comprador usa el mismo gris de siempre', () => {
    render(
      <ChatMessageItem
        message={makeMessage({ author_role: 'comprador' })}
        canModerate={false}
        onRequestDelete={vi.fn()}
      />,
    );
    expect(screen.getByText('Hola a todos').closest('div')).toHaveClass('bg-slate-100');
  });

  it('un mensaje del rematador se destaca en celeste, no en gris', () => {
    render(
      <ChatMessageItem
        message={makeMessage({ author_role: 'rematador' })}
        canModerate={false}
        onRequestDelete={vi.fn()}
      />,
    );
    const bubble = screen.getByText('Hola a todos').closest('div');
    expect(bubble).toHaveClass('bg-sky-100');
    expect(bubble).not.toHaveClass('bg-slate-100');
  });

  it('un mensaje propio siempre usa el color de marca, sin importar el rol', () => {
    render(
      <ChatMessageItem
        message={makeMessage({ author_role: 'rematador' })}
        canModerate={false}
        onRequestDelete={vi.fn()}
        isOwnMessage
      />,
    );
    expect(screen.getByText('Hola a todos').closest('div')).toHaveClass('bg-brand-600');
  });

  it('sin permiso de moderación, no muestra el botón de eliminar', () => {
    render(<ChatMessageItem message={makeMessage()} canModerate={false} onRequestDelete={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Eliminar mensaje' })).not.toBeInTheDocument();
  });

  it('con permiso de moderación, el botón de eliminar llama a onRequestDelete con el mensaje', async () => {
    const onRequestDelete = vi.fn();
    const message = makeMessage();
    render(<ChatMessageItem message={message} canModerate onRequestDelete={onRequestDelete} />);

    await userEvent.click(screen.getByRole('button', { name: 'Eliminar mensaje' }));
    expect(onRequestDelete).toHaveBeenCalledWith(message);
  });

  it('mensaje eliminado: muestra el copy de reemplazo y oculta el botón de eliminar aunque se pueda moderar', () => {
    render(
      <ChatMessageItem
        message={makeMessage({ is_deleted: true, content: null })}
        canModerate
        onRequestDelete={vi.fn()}
      />,
    );

    expect(screen.getByText('Mensaje eliminado')).toBeInTheDocument();
    expect(screen.queryByText('Hola a todos')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Eliminar mensaje' })).not.toBeInTheDocument();
  });

  // --- Destacar (Épica 7, Módulo 7.6) ---------------------------------------------------

  it('sin onTogglePin, no muestra el botón de destacar', () => {
    render(<ChatMessageItem message={makeMessage()} canModerate onRequestDelete={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Destacar mensaje' })).not.toBeInTheDocument();
  });

  it('con onTogglePin, el botón de destacar llama a onTogglePin con el mensaje', async () => {
    const onTogglePin = vi.fn();
    const message = makeMessage();
    render(
      <ChatMessageItem
        message={message}
        canModerate
        onRequestDelete={vi.fn()}
        onTogglePin={onTogglePin}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Destacar mensaje' }));
    expect(onTogglePin).toHaveBeenCalledWith(message);
  });

  it('isPinned muestra el ícono de destacado y el botón para quitarlo', async () => {
    const onTogglePin = vi.fn();
    const message = makeMessage();
    render(
      <ChatMessageItem
        message={message}
        canModerate
        onRequestDelete={vi.fn()}
        isPinned
        onTogglePin={onTogglePin}
      />,
    );

    const button = screen.getByRole('button', { name: 'Quitar destacado' });
    await userEvent.click(button);
    expect(onTogglePin).toHaveBeenCalledWith(message);
  });

  it('un mensaje eliminado nunca muestra el botón de destacar, aunque haya onTogglePin', () => {
    render(
      <ChatMessageItem
        message={makeMessage({ is_deleted: true, content: null })}
        canModerate
        onRequestDelete={vi.fn()}
        onTogglePin={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Destacar mensaje' })).not.toBeInTheDocument();
  });

  // --- Agrupado de mensajes consecutivos --------------------------------------------------

  it('showHeader=false oculta el nombre pero sigue mostrando el contenido', () => {
    render(<ChatMessageItem message={makeMessage()} canModerate={false} onRequestDelete={vi.fn()} showHeader={false} />);

    expect(screen.queryByText('Juan Pérez')).not.toBeInTheDocument();
    expect(screen.queryByText('Comprador')).not.toBeInTheDocument();
    expect(screen.getByText('Hola a todos')).toBeInTheDocument();
  });

  // --- Nubecita: mensaje propio vs. de otra persona -------------------------------------

  it('isOwnMessage oculta el nombre/rol (es obvio que sos vos)', () => {
    render(<ChatMessageItem message={makeMessage()} canModerate={false} onRequestDelete={vi.fn()} isOwnMessage />);

    expect(screen.queryByText('Juan Pérez')).not.toBeInTheDocument();
    expect(screen.queryByText('Comprador')).not.toBeInTheDocument();
    expect(screen.getByText('Hola a todos')).toBeInTheDocument();
  });

  it('sin isOwnMessage (default), muestra el nombre de quien escribió', () => {
    render(<ChatMessageItem message={makeMessage()} canModerate={false} onRequestDelete={vi.fn()} />);
    expect(screen.getByText('Juan Pérez')).toBeInTheDocument();
  });

  it('showHeader=false igual permite eliminar/destacar el mensaje agrupado', async () => {
    const onRequestDelete = vi.fn();
    const message = makeMessage();
    render(
      <ChatMessageItem message={message} canModerate onRequestDelete={onRequestDelete} showHeader={false} onTogglePin={vi.fn()} />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Eliminar mensaje' }));
    expect(onRequestDelete).toHaveBeenCalledWith(message);
  });
});
