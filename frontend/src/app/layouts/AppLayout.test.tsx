import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppLayout } from './AppLayout';
import { useLayoutPreferencesStore } from './layoutPreferencesStore';

const { useAuthMock, useAuthActionsMock } = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  useAuthActionsMock: vi.fn(() => ({ logout: vi.fn() })),
}));
vi.mock('../../features/auth/hooks', () => ({
  useAuth: useAuthMock,
  useAuthActions: useAuthActionsMock,
}));

vi.mock('../../features/notifications/components/NotificationBell', () => ({
  NotificationBell: () => null,
}));

function renderLayout() {
  return render(
    <MemoryRouter>
      <AppLayout />
    </MemoryRouter>,
  );
}

afterEach(() => {
  act(() => {
    useLayoutPreferencesStore.setState({ isWide: false, isFocusMode: false, isTopNav: false, isTopNavStatic: false });
  });
});

describe('AppLayout', () => {
  it('por default, el <main> usa el ancho angosto (max-w-5xl)', () => {
    useAuthMock.mockReturnValue({ user: { full_name: 'Ana', role: 'comprador' } });

    const { container } = renderLayout();

    expect(container.querySelector('main')).toHaveClass('max-w-5xl');
  });

  it('con isWide en true (useWideLayout), el <main> usa el ancho amplio', () => {
    useAuthMock.mockReturnValue({ user: { full_name: 'Ana', role: 'comprador' } });
    act(() => {
      useLayoutPreferencesStore.setState({ isWide: true });
    });

    const { container } = renderLayout();

    expect(container.querySelector('main')).toHaveClass('max-w-[90rem]');
    expect(container.querySelector('main')).not.toHaveClass('max-w-5xl');
  });

  it('para un admin, el sidebar muestra el link al panel de administrador', () => {
    useAuthMock.mockReturnValue({ user: { full_name: 'Cami', role: 'admin' } });

    renderLayout();

    expect(screen.getAllByRole('link', { name: 'Panel de administrador' })[0]).toBeInTheDocument();
  });

  it('para un comprador, el sidebar muestra Remates y Mis compras, no el panel admin', () => {
    useAuthMock.mockReturnValue({ user: { full_name: 'Ana', role: 'comprador' } });

    renderLayout();

    expect(screen.getAllByRole('link', { name: 'Remates' })[0]).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Panel de administrador' })).not.toBeInTheDocument();
  });

  it('muestra el nombre y rol del usuario en el header', () => {
    useAuthMock.mockReturnValue({ user: { full_name: 'Ana', role: 'comprador' } });

    renderLayout();

    expect(screen.getByText('Ana', { exact: false })).toBeInTheDocument();
  });

  it('con isFocusMode en true (useFocusMode), el sidebar sigue visible pero el header se oculta', () => {
    useAuthMock.mockReturnValue({ user: { full_name: 'Ana', role: 'comprador' } });
    act(() => {
      useLayoutPreferencesStore.setState({ isFocusMode: true });
    });

    renderLayout();

    // El sidebar (ahora un riel compacto siempre visible) no se oculta más en Modo
    // Remate -- solo el `Header` (breadcrumb + notificaciones + hamburguesa mobile) lo
    // hace, que es la verdadera "barra superior" que la Consola Operativa no quiere.
    expect(screen.getAllByRole('link', { name: 'Remates' })[0]).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Cerrar sesión/ })[0]).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Abrir menú de navegación' })).not.toBeInTheDocument();
  });

  it('con isFocusMode en true, el <main> usa el ancho amplio de la consola, no max-w-5xl/90rem', () => {
    useAuthMock.mockReturnValue({ user: { full_name: 'Ana', role: 'comprador' } });
    act(() => {
      useLayoutPreferencesStore.setState({ isFocusMode: true });
    });

    const { container } = renderLayout();

    expect(container.querySelector('main')).toHaveClass('max-w-[110rem]');
    expect(container.querySelector('main')).not.toHaveClass('max-w-5xl');
    expect(container.querySelector('main')).not.toHaveClass('max-w-[90rem]');
  });

  it('con isTopNav en true (useTopNavLayout), reemplaza Sidebar y Header por la barra superior y suelta el ancho del <main>', () => {
    useAuthMock.mockReturnValue({ user: { full_name: 'Ana', role: 'comprador' } });
    act(() => {
      useLayoutPreferencesStore.setState({ isTopNav: true });
    });

    const { container } = renderLayout();

    expect(screen.getAllByRole('navigation', { name: 'Navegación principal' })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Abrir menú de navegación' })).not.toBeInTheDocument();
    expect(container.querySelector('aside')).not.toBeInTheDocument();
    expect(container.querySelector('main')).toHaveClass('max-w-none');
    expect(container.querySelector('main')).not.toHaveClass('px-4');
  });

  it('sin isTopNav, se mantiene el Sidebar con su Header y no se monta la barra superior', () => {
    useAuthMock.mockReturnValue({ user: { full_name: 'Ana', role: 'comprador' } });

    const { container } = renderLayout();

    expect(container.querySelector('aside')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Abrir menú de navegación' })).toBeInTheDocument();
  });

  it('con isTopNav e isTopNavStatic (la Sala en vivo), la barra superior es fija al principio de la página: no sticky', () => {
    useAuthMock.mockReturnValue({ user: { full_name: 'Ana', role: 'comprador' } });
    act(() => {
      useLayoutPreferencesStore.setState({ isTopNav: true, isTopNavStatic: true });
    });

    const { container } = renderLayout();

    const header = container.querySelector('header');
    expect(header).toHaveClass('relative');
    expect(header).not.toHaveClass('sticky');
  });

  it('con isTopNav sin isTopNavStatic (inicio, Mis compras...), la barra sigue sticky', () => {
    useAuthMock.mockReturnValue({ user: { full_name: 'Ana', role: 'comprador' } });
    act(() => {
      useLayoutPreferencesStore.setState({ isTopNav: true });
    });

    const { container } = renderLayout();

    expect(container.querySelector('header')).toHaveClass('sticky');
  });
});
