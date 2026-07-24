import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Sidebar } from './Sidebar';

function renderSidebar(role: 'comprador' | 'rematador' | 'admin', isOpen = false, onClose = vi.fn()) {
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

  it('para rematador, muestra sus tres secciones', () => {
    renderSidebar('rematador');
    expect(screen.getAllByRole('link', { name: 'Mis remates' })[0]).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Ventas adjudicadas' })[0]).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Historial' })[0]).toBeInTheDocument();
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
});
