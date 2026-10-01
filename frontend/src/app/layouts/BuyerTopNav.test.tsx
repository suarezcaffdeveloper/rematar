import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { BuyerTopNav } from './BuyerTopNav';

const { useAuthMock, useAuthActionsMock, navigateMock } = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  useAuthActionsMock: vi.fn(() => ({ logout: vi.fn() })),
  navigateMock: vi.fn(),
}));
vi.mock('../../features/auth/hooks', () => ({
  useAuth: useAuthMock,
  useAuthActions: useAuthActionsMock,
}));
vi.mock('../../features/notifications/components/NotificationBell', () => ({
  NotificationBell: () => <button type="button">Notificaciones</button>,
}));
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => navigateMock,
}));

const buyer = { full_name: 'Ana Compradora', role: 'comprador', avatar_url: null };

function renderNav(initialPath = '/', staticBar = false) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <BuyerTopNav staticBar={staticBar} />
    </MemoryRouter>,
  );
}

describe('BuyerTopNav', () => {
  it('para un comprador, muestra las mismas opciones que el sidebar', () => {
    useAuthMock.mockReturnValue({ user: buyer });

    renderNav();

    expect(screen.getByRole('link', { name: 'Remates' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Ingresar a remate privado' })).toHaveAttribute(
      'href',
      '/remates-privados/ingresar',
    );
    expect(screen.getByRole('link', { name: 'Mis compras' })).toHaveAttribute('href', '/mis-compras');
    expect(screen.queryByRole('link', { name: 'Historial' })).not.toBeInTheDocument();
  });

  it('marca como página actual la opción de la ruta en la que está', () => {
    useAuthMock.mockReturnValue({ user: buyer });

    renderNav('/mis-compras');

    expect(screen.getByRole('link', { name: 'Mis compras' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Remates' })).not.toHaveAttribute('aria-current');
  });

  it('usa las opciones del rol, no las del comprador, para una empresa', () => {
    useAuthMock.mockReturnValue({ user: { ...buyer, role: 'empresa' } });

    renderNav();

    expect(screen.getByRole('link', { name: 'Mis remates' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ventas adjudicadas' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Mis compras' })).not.toBeInTheDocument();
  });

  it('con sesión, muestra la campana, el perfil con el nombre del usuario y el botón de salir', () => {
    useAuthMock.mockReturnValue({ user: buyer });

    renderNav();

    expect(screen.getByRole('button', { name: 'Notificaciones' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver mi perfil' })).toHaveAttribute('href', '/perfil');
    expect(screen.getByText('Ana Compradora')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument();
  });

  it('cerrar sesión pide confirmación y recién al confirmar llama a logout y va a /login', async () => {
    const logout = vi.fn();
    navigateMock.mockClear();
    useAuthMock.mockReturnValue({ user: buyer });
    useAuthActionsMock.mockReturnValue({ logout });

    renderNav();
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));

    expect(logout).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('alertdialog', { name: 'Cerrar sesión' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cerrar sesión' }));

    expect(logout).toHaveBeenCalledTimes(1);
    expect(navigateMock).toHaveBeenCalledWith('/login');
  });

  it('un visitante anónimo ve "Iniciar sesión" en lugar de campana, perfil y salir', async () => {
    useAuthMock.mockReturnValue({ user: null });
    navigateMock.mockClear();

    renderNav('/remates');

    expect(screen.getByRole('link', { name: 'Todos los remates' })).toHaveAttribute('href', '/remates');
    expect(screen.queryByRole('button', { name: 'Notificaciones' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Ver mi perfil' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cerrar sesión' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
    expect(navigateMock).toHaveBeenCalledWith('/login');
  });

  it('el logo lleva al inicio si hay sesión y al listado público si no', () => {
    useAuthMock.mockReturnValue({ user: buyer });
    const { unmount } = renderNav();
    expect(screen.getByRole('link', { name: 'RematAR, ir al inicio' })).toHaveAttribute('href', '/');
    unmount();

    useAuthMock.mockReturnValue({ user: null });
    renderNav('/remates');
    expect(screen.getByRole('link', { name: 'RematAR, ir al inicio' })).toHaveAttribute('href', '/remates');
  });

  it('por defecto la barra sigue el scroll (sticky); con staticBar se queda al principio de la página', () => {
    useAuthMock.mockReturnValue({ user: buyer });

    const { container, unmount } = renderNav();
    expect(container.querySelector('header')).toHaveClass('sticky');
    unmount();

    const { container: staticContainer } = renderNav('/', true);
    expect(staticContainer.querySelector('header')).toHaveClass('relative');
    expect(staticContainer.querySelector('header')).not.toHaveClass('sticky');
  });

  it('con staticBar mantiene las mismas opciones, campana, perfil y salir', () => {
    useAuthMock.mockReturnValue({ user: buyer });

    renderNav('/', true);

    expect(screen.getByRole('link', { name: 'Remates' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Notificaciones' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeInTheDocument();
  });
});
