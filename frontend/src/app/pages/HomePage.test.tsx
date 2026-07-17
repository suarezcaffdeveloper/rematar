import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HomePage } from './HomePage';

const { useAuthMock } = vi.hoisted(() => ({ useAuthMock: vi.fn() }));
vi.mock('../../features/auth/hooks', () => ({ useAuth: useAuthMock }));
vi.mock('../../features/remates/pages/CompradorDashboardPage', () => ({
  CompradorDashboardPage: () => <p>Dashboard del comprador</p>,
}));

describe('HomePage', () => {
  it('para un comprador, renderiza el dashboard real de remates', () => {
    useAuthMock.mockReturnValue({ user: { full_name: 'Ana', role: 'comprador' } });

    render(<HomePage />);

    expect(screen.getByText('Dashboard del comprador')).toBeInTheDocument();
  });

  it('para un rematador, sigue mostrando el placeholder (dashboard propio es un módulo futuro)', () => {
    useAuthMock.mockReturnValue({ user: { full_name: 'Beto', role: 'rematador' } });

    render(<HomePage />);

    expect(screen.getByText('Bienvenido, Beto')).toBeInTheDocument();
    expect(screen.queryByText('Dashboard del comprador')).not.toBeInTheDocument();
  });

  it('para un admin, sigue mostrando el placeholder', () => {
    useAuthMock.mockReturnValue({ user: { full_name: 'Cami', role: 'admin' } });

    render(<HomePage />);

    expect(screen.getByText('Bienvenido, Cami')).toBeInTheDocument();
  });
});
