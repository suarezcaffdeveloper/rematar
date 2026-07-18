import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmModal } from './ConfirmModal';

describe('ConfirmModal', () => {
  it('muestra título y mensaje', () => {
    render(
      <ConfirmModal
        isOpen
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        title="Eliminar remate"
        message="¿Seguro que querés eliminar este remate?"
      />,
    );
    expect(screen.getByText('Eliminar remate')).toBeInTheDocument();
    expect(screen.getByText('¿Seguro que querés eliminar este remate?')).toBeInTheDocument();
  });

  it('confirmar llama a onConfirm', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(
      <ConfirmModal isOpen onClose={vi.fn()} onConfirm={onConfirm} title="t" message="m" confirmLabel="Eliminar" />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Eliminar' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('cancelar llama a onClose sin llamar a onConfirm', async () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();
    render(<ConfirmModal isOpen onClose={onClose} onConfirm={onConfirm} title="t" message="m" />);
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('mientras onConfirm resuelve, muestra estado de carga', async () => {
    let resolveConfirm: () => void = () => {};
    const onConfirm = vi.fn(() => new Promise<void>((resolve) => { resolveConfirm = resolve; }));
    render(<ConfirmModal isOpen onClose={vi.fn()} onConfirm={onConfirm} title="t" message="m" confirmLabel="Eliminar" />);

    await userEvent.click(screen.getByRole('button', { name: 'Eliminar' }));
    // Mientras carga, el botón incorpora el texto accesible del spinner ("Cargando…")
    // -- se busca por coincidencia parcial en vez del texto exacto.
    expect(screen.getByRole('button', { name: /Eliminar/ })).toBeDisabled();

    resolveConfirm();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Eliminar' })).toBeEnabled());
  });
});
