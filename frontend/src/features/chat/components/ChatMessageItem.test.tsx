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
    author_avatar_url: null,
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

  it('con author_avatar_url, muestra la foto de perfil del autor en vez de sus iniciales', () => {
    const { container } = render(
      <ChatMessageItem
        message={makeMessage({ author_avatar_url: 'https://cdn.example.com/juan.jpg' })}
        canModerate={false}
        onRequestDelete={vi.fn()}
      />,
    );

    expect(container.querySelector('img')).toHaveAttribute('src', 'https://cdn.example.com/juan.jpg');
  });

  it('sin author_avatar_url, muestra las iniciales del autor', () => {
    const { container } = render(<ChatMessageItem message={makeMessage()} canModerate={false} onRequestDelete={vi.fn()} />);

    expect(container.querySelector('img')).not.toBeInTheDocument();
    expect(screen.getByText('JP')).toBeInTheDocument();
  });

  it('un mensaje de un bot no muestra el globito "Simulador" (pedido explícito de sacarlo)', () => {
    render(
      <ChatMessageItem message={makeMessage({ is_bot: true })} canModerate={false} onRequestDelete={vi.fn()} />,
    );
    expect(screen.queryByText('Simulador')).not.toBeInTheDocument();
  });

  // --- Color del nombre según el rol (rediseño visual -- fila plana, sin nubecita) -----

  it('un mensaje de un comprador usa el mismo gris de siempre', () => {
    render(
      <ChatMessageItem
        message={makeMessage({ author_role: 'comprador' })}
        canModerate={false}
        onRequestDelete={vi.fn()}
      />,
    );
    expect(screen.getByText('Juan Pérez')).toHaveClass('text-ink-muted');
  });

  it('un mensaje del rematador se destaca en celeste, no en gris', () => {
    render(
      <ChatMessageItem
        message={makeMessage({ author_role: 'rematador' })}
        canModerate={false}
        onRequestDelete={vi.fn()}
      />,
    );
    const name = screen.getByText('Juan Pérez');
    expect(name).toHaveClass('text-sky-700');
    expect(name).not.toHaveClass('text-ink-muted');
  });

  it('un mensaje propio siempre usa el color de marca en el texto, sin importar el rol', () => {
    render(
      <ChatMessageItem
        message={makeMessage({ author_role: 'rematador' })}
        canModerate={false}
        onRequestDelete={vi.fn()}
        isOwnMessage
      />,
    );
    expect(screen.getByText('Hola a todos')).toHaveClass('text-brand-700');
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

  // --- XSS (Fase 5 de remediación del WebSocket Security Audit) -------------------------
  //
  // `ChatMessageItem` renderiza `message.content`/`message.author_name` como children de
  // texto de JSX (`{message.content}`) -- React los escapa automáticamente, nunca los
  // interpreta como HTML (a diferencia de `dangerouslySetInnerHTML`, que este componente
  // no usa en ningún lado). Estos tests son la prueba directa de esa garantía: si alguna
  // vez alguien reemplazara la interpolación de texto por un sink inseguro, estos tests
  // fallarían porque el payload SÍ aparecería como un nodo real del DOM.

  it('TEST 1 -- un <script> en el contenido nunca se convierte en un nodo <script> real', () => {
    const payload = '<script>alert(1)</script>';
    const { container } = render(
      <ChatMessageItem message={makeMessage({ content: payload })} canModerate={false} onRequestDelete={vi.fn()} />,
    );

    expect(container.querySelector('script')).not.toBeInTheDocument();
    expect(screen.getByText(payload)).toBeInTheDocument();
  });

  it('TEST 2 -- un <img onerror> en el contenido nunca se convierte en un <img> real con el handler activo', () => {
    const payload = '<img src=x onerror=alert(1)>';
    const { container } = render(
      <ChatMessageItem message={makeMessage({ content: payload })} canModerate={false} onRequestDelete={vi.fn()} />,
    );

    // El único <img> legítimo de este componente es el avatar (con author_avatar_url
    // null en este mensaje, ni siquiera ese existe) -- ninguno debe tener `onerror`.
    expect(container.querySelectorAll('img[onerror]')).toHaveLength(0);
    expect(screen.getByText(payload)).toBeInTheDocument();
  });

  it('TEST 3 -- un SVG con handler en el contenido nunca se convierte en un <svg> real', () => {
    const payload = '<svg onload=alert(1)><circle r=1></circle></svg>';
    const { container } = render(
      <ChatMessageItem message={makeMessage({ content: payload })} canModerate={false} onRequestDelete={vi.fn()} />,
    );

    expect(container.querySelector('svg')).not.toBeInTheDocument();
    expect(screen.getByText(payload)).toBeInTheDocument();
  });

  it('TEST 4 -- un link javascript: nunca se convierte en un <a> real (el chat no soporta links)', () => {
    const payload = '<a href="javascript:alert(1)">click acá</a>';
    const { container } = render(
      <ChatMessageItem message={makeMessage({ content: payload })} canModerate={false} onRequestDelete={vi.fn()} />,
    );

    expect(container.querySelector('a')).not.toBeInTheDocument();
    expect(screen.getByText(payload)).toBeInTheDocument();
  });

  it('TEST 5 -- una variante encoded/obfuscada tampoco se decodifica en HTML real', () => {
    const payload = '&lt;script&gt;alert(1)&lt;/script&gt;<script>alert(1)</script>';
    const { container } = render(
      <ChatMessageItem message={makeMessage({ content: payload })} canModerate={false} onRequestDelete={vi.fn()} />,
    );

    expect(container.querySelector('script')).not.toBeInTheDocument();
    // El texto llega literal -- ni siquiera las entidades HTML (`&lt;`) se decodifican
    // dos veces, porque nunca pasan por un parser de HTML.
    expect(screen.getByText(payload)).toBeInTheDocument();
  });

  it('un mensaje de sistema con contenido malicioso tampoco se interpreta (mismo sink de texto)', () => {
    const payload = '<img src=x onerror=alert(1)>';
    const { container } = render(
      <ChatMessageItem
        message={makeMessage({ kind: 'system', content: payload, author_id: null, author_name: null, author_role: null })}
        canModerate
        onRequestDelete={vi.fn()}
      />,
    );

    expect(container.querySelector('img')).not.toBeInTheDocument();
    expect(screen.getByText(payload, { exact: false })).toBeInTheDocument();
  });

  it('un author_name malicioso (denormalizado del usuario) tampoco se interpreta', () => {
    const payload = '<img src=x onerror=alert(1)>';
    const { container } = render(
      <ChatMessageItem message={makeMessage({ author_name: payload })} canModerate={false} onRequestDelete={vi.fn()} />,
    );

    expect(container.querySelector('img[onerror]')).toBeNull();
    expect(screen.getByText(payload)).toBeInTheDocument();
  });
});
