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
    useLayoutPreferencesStore.setState({ isWide: false });
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
});
