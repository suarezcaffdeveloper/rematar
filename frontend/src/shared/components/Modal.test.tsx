import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Modal } from './Modal';

describe('Modal', () => {
  it('cerrado, no renderiza nada', () => {
    render(
      <Modal isOpen={false} onClose={vi.fn()} title="Título">
        contenido
      </Modal>,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('abierto, muestra título y contenido', () => {
    render(
      <Modal isOpen onClose={vi.fn()} title="Editar remate">
        <p>contenido del formulario</p>
      </Modal>,
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Editar remate')).toBeInTheDocument();
    expect(screen.getByText('contenido del formulario')).toBeInTheDocument();
  });

  it('el botón de cerrar llama a onClose', async () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen onClose={onClose} title="Título">
        contenido
      </Modal>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('clickear el fondo llama a onClose', async () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen onClose={onClose} title="Título">
        contenido
      </Modal>,
    );
    // El modal se renderiza vía `createPortal` en `document.body`, fuera del
    // `container` de testing-library -- se busca directamente en el documento.
    const backdrop = document.querySelector('[aria-hidden="true"]');
    expect(backdrop).not.toBeNull();
    await userEvent.click(backdrop as Element);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('la tecla Escape llama a onClose', async () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen onClose={onClose} title="Título">
        contenido
      </Modal>,
    );
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renderiza el footer cuando se provee', () => {
    render(
      <Modal isOpen onClose={vi.fn()} title="Título" footer={<button type="button">Confirmar</button>}>
        contenido
      </Modal>,
    );
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeInTheDocument();
  });
});
