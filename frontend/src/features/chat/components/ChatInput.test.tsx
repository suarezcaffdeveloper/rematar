import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatInput } from './ChatInput';

describe('ChatInput', () => {
  it('el botón de enviar arranca deshabilitado con el campo vacío', () => {
    render(<ChatInput onSend={vi.fn()} onTyping={vi.fn()} isSending={false} sendError={null} />);
    expect(screen.getByRole('button', { name: 'Enviar mensaje' })).toBeDisabled();
  });

  it('al escribir, llama a onTyping en cada tecla y habilita el envío', async () => {
    const onTyping = vi.fn();
    render(<ChatInput onSend={vi.fn()} onTyping={onTyping} isSending={false} sendError={null} />);

    await userEvent.type(screen.getByPlaceholderText('Escribí un mensaje...'), 'Hola');

    expect(onTyping).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Enviar mensaje' })).toBeEnabled();
  });

  it('un contenido solo de espacios no habilita el envío', async () => {
    render(<ChatInput onSend={vi.fn()} onTyping={vi.fn()} isSending={false} sendError={null} />);
    await userEvent.type(screen.getByPlaceholderText('Escribí un mensaje...'), '   ');
    expect(screen.getByRole('button', { name: 'Enviar mensaje' })).toBeDisabled();
  });

  it('al hacer click en enviar, llama a onSend con el contenido recortado y limpia el campo', async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    render(<ChatInput onSend={onSend} onTyping={vi.fn()} isSending={false} sendError={null} />);

    const textarea = screen.getByPlaceholderText('Escribí un mensaje...');
    await userEvent.type(textarea, '  Hola mundo  ');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar mensaje' }));

    expect(onSend).toHaveBeenCalledWith('Hola mundo');
    expect(textarea).toHaveValue('');
  });

  it('Enter envía el mensaje, Shift+Enter agrega un salto de línea', async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    render(<ChatInput onSend={onSend} onTyping={vi.fn()} isSending={false} sendError={null} />);

    const textarea = screen.getByPlaceholderText('Escribí un mensaje...');
    await userEvent.type(textarea, 'Hola{Shift>}{Enter}{/Shift}mundo');
    expect(onSend).not.toHaveBeenCalled();
    expect(textarea).toHaveValue('Hola\nmundo');

    await userEvent.type(textarea, '{Enter}');
    expect(onSend).toHaveBeenCalledWith('Hola\nmundo');
  });

  it('si onSend falla, restaura el texto no enviado en vez de perderlo', async () => {
    const onSend = vi.fn().mockRejectedValue(new Error('falló'));
    render(<ChatInput onSend={onSend} onTyping={vi.fn()} isSending={false} sendError={null} />);

    const textarea = screen.getByPlaceholderText('Escribí un mensaje...');
    await userEvent.type(textarea, 'Se pierde?');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar mensaje' }));

    expect(await screen.findByDisplayValue('Se pierde?')).toBeInTheDocument();
  });

  it('con isSending true, el botón queda deshabilitado', () => {
    render(<ChatInput onSend={vi.fn()} onTyping={vi.fn()} isSending sendError={null} />);
    expect(screen.getByRole('button', { name: 'Enviar mensaje' })).toBeDisabled();
  });

  it('con sendError, muestra el mensaje de error', () => {
    render(
      <ChatInput
        onSend={vi.fn()}
        onTyping={vi.fn()}
        isSending={false}
        sendError={{ status: 429, code: 'rate_limited', message: 'Esperá un momento antes de enviar otro mensaje.' }}
      />,
    );
    expect(screen.getByText('Esperá un momento antes de enviar otro mensaje.')).toBeInTheDocument();
  });

  it('el contador de caracteres refleja la longitud actual', async () => {
    render(<ChatInput onSend={vi.fn()} onTyping={vi.fn()} isSending={false} sendError={null} />);
    await userEvent.type(screen.getByPlaceholderText('Escribí un mensaje...'), 'Hola');
    expect(screen.getByText('4/500')).toBeInTheDocument();
  });
});
