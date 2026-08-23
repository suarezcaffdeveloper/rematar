import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Sidebar } from './Sidebar';

const { useAuthMock, useAuthActionsMock } = vi.hoisted(() => ({
  useAuthMock: vi.fn(() => ({ user: { full_name: 'Ana Rematadora', role: 'comprador' } })),
  useAuthActionsMock: vi.fn(() => ({ logout: vi.fn() })),
}));
vi.mock('../../features/auth/hooks', () => ({
  useAuth: useAuthMock,
  useAuthActions: useAuthActionsMock,
}));

function renderSidebar(
  role: 'comprador' | 'empresa' | 'rematador' | 'admin',
  isOpen = false,
  onClose = vi.fn(),
) {
  return render(
    <MemoryRouter>
      <Sidebar role={role} isOpen={isOpen} onClose={onClose} />
    </MemoryRouter>,
  );
}

describe('Sidebar', () => {
  it('para comprador, muestra Remates y Mis compras', () => {
    renderSidebar('comprador');
    expect(screen.getAllByRole('link', { name: 'Remates' })[0]).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Mis compras' })[0]).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Historial' })).not.toBeInTheDocument();
  });

  it('para empresa, muestra sus tres secciones (ADR-047, hereda la navegación del ex-rematador)', () => {
    renderSidebar('empresa');
    expect(screen.getAllByRole('link', { name: 'Mis remates' })[0]).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Ventas adjudicadas' })[0]).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Historial' })[0]).toBeInTheDocument();
  });

  it('para rematador (operador acotado, ADR-048), muestra únicamente "Unirme a un remate"', () => {
    renderSidebar('rematador');
    expect(screen.getAllByRole('link', { name: 'Unirme a un remate' })[0]).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Ventas adjudicadas' })).not.toBeInTheDocument();
  });

  it('para admin, muestra únicamente el panel de administración', () => {
    renderSidebar('admin');
    expect(screen.getAllByRole('link', { name: 'Panel de administrador' })[0]).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Remates' })).not.toBeInTheDocument();
  });

  it('con isOpen en false, no muestra el drawer mobile (overlay)', () => {
    const { container } = renderSidebar('comprador', false);
    expect(container.querySelector('.fixed.inset-0.z-40')).not.toBeInTheDocument();
  });

  it('con isOpen en true, clickear el overlay llama a onClose', async () => {
    const onClose = vi.fn();
    const { container } = renderSidebar('comprador', true, onClose);

    const overlay = container.querySelector('.fixed.inset-0.z-40 > div[aria-hidden="true"]');
    expect(overlay).toBeInTheDocument();
    await userEvent.click(overlay as Element);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('con isOpen en true, la tecla Escape llama a onClose', async () => {
    const onClose = vi.fn();
    renderSidebar('comprador', true, onClose);

    await userEvent.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('muestra el nombre y rol del usuario en el pie', () => {
    renderSidebar('comprador');

    expect(screen.getAllByText('Ana Rematadora')[0]).toBeInTheDocument();
    expect(screen.getAllByText('comprador')[0]).toBeInTheDocument();
  });

  it('el botón de cerrar sesión abre un diálogo de confirmación sin llamar a logout todavía', async () => {
    const logout = vi.fn();
    useAuthActionsMock.mockReturnValue({ logout });
    renderSidebar('comprador');

    await userEvent.click(screen.getAllByRole('button', { name: /Cerrar sesión/ })[0]);

    expect(screen.getByRole('alertdialog', { name: 'Cerrar sesión' })).toBeInTheDocument();
    expect(logout).not.toHaveBeenCalled();
  });

  it('confirmar en el diálogo llama a logout y lo cierra', async () => {
    const logout = vi.fn();
    useAuthActionsMock.mockReturnValue({ logout });
    renderSidebar('comprador');

    await userEvent.click(screen.getAllByRole('button', { name: /Cerrar sesión/ })[0]);
    const dialog = screen.getByRole('alertdialog', { name: 'Cerrar sesión' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cerrar sesión' }));

    expect(logout).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  });

  it('cancelar en el diálogo no llama a logout y lo cierra', async () => {
    const logout = vi.fn();
    useAuthActionsMock.mockReturnValue({ logout });
    renderSidebar('comprador');

    await userEvent.click(screen.getAllByRole('button', { name: /Cerrar sesión/ })[0]);
    const dialog = screen.getByRole('alertdialog', { name: 'Cerrar sesión' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));

    expect(logout).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  });
});
