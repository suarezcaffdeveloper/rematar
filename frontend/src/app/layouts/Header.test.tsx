import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Header } from './Header';
import { useBreadcrumbStore } from './breadcrumbStore';

// `NotificationBell` (montado en `Header` desde la Etapa 3) hace sus propias llamadas
// HTTP -- se reemplaza por un stub simple, esos hooks ya tienen sus propios tests en
// `features/notifications/`.
vi.mock('../../features/notifications/components/NotificationBell', () => ({
  NotificationBell: () => null,
}));

const { useAuthMock } = vi.hoisted(() => ({
  useAuthMock: vi.fn(() => ({ isAuthenticated: false })),
}));
vi.mock('../../features/auth/hooks', () => ({
  useAuth: useAuthMock,
}));

function renderHeader(onOpenSidebar = vi.fn(), initialPath = '/remates') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/login" element={<p>Pantalla de login</p>} />
        <Route path="*" element={<Header onOpenSidebar={onOpenSidebar} />} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  act(() => {
    useBreadcrumbStore.setState({ items: [] });
  });
  useAuthMock.mockReturnValue({ isAuthenticated: false });
});

describe('Header', () => {
  it('sin items en el breadcrumbStore, no renderiza ningún breadcrumb', () => {
    renderHeader();

    expect(screen.queryByRole('navigation', { name: 'Ruta de navegación' })).not.toBeInTheDocument();
  });

  it('con items en el breadcrumbStore, los renderiza', () => {
    act(() => {
      useBreadcrumbStore.getState().setItems([{ label: 'Inicio', to: '/' }, { label: 'Detalle' }]);
    });

    renderHeader();

    expect(screen.getByText('Detalle')).toBeInTheDocument();
  });

  it('el botón de hamburguesa llama a onOpenSidebar', async () => {
    const onOpenSidebar = vi.fn();
    renderHeader(onOpenSidebar);

    await userEvent.click(screen.getByRole('button', { name: 'Abrir menú de navegación' }));

    expect(onOpenSidebar).toHaveBeenCalledTimes(1);
  });

  it('sin sesión (visitante de /remates), muestra "Iniciar sesión" y lleva a /login', async () => {
    renderHeader();

    await userEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));

    expect(screen.getByText('Pantalla de login')).toBeInTheDocument();
  });

  it('con sesión iniciada, no muestra el botón "Iniciar sesión"', () => {
    useAuthMock.mockReturnValue({ isAuthenticated: true });
    renderHeader();

    expect(screen.queryByRole('button', { name: 'Iniciar sesión' })).not.toBeInTheDocument();
  });
});
