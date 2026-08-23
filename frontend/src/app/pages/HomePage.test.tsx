import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HomePage } from './HomePage';

function renderHomePage() {
  return render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>,
  );
}

const { useAuthMock } = vi.hoisted(() => ({ useAuthMock: vi.fn() }));
vi.mock('../../features/auth/hooks', () => ({ useAuth: useAuthMock }));
vi.mock('../../features/remates/pages/CompradorDashboardPage', () => ({
  CompradorDashboardPage: () => <p>Dashboard del comprador</p>,
}));
vi.mock('../../features/rematador/pages/RematadorDashboardPage', () => ({
  RematadorDashboardPage: () => <p>Dashboard del rematador</p>,
}));
vi.mock('../../features/rematador/pages/OperatorClaimPage', () => ({
  OperatorClaimPage: () => <p>Unirme como operador</p>,
}));

describe('HomePage', () => {
  it('para un comprador, renderiza el dashboard real de remates', () => {
    useAuthMock.mockReturnValue({ user: { full_name: 'Ana', role: 'comprador' } });

    renderHomePage();

    expect(screen.getByText('Dashboard del comprador')).toBeInTheDocument();
  });

  it('para una empresa, renderiza el dashboard de remates propios (ADR-047)', () => {
    useAuthMock.mockReturnValue({ user: { full_name: 'Beto', role: 'empresa' } });

    renderHomePage();

    expect(screen.getByText('Dashboard del rematador')).toBeInTheDocument();
    expect(screen.queryByText('Bienvenido, Beto')).not.toBeInTheDocument();
  });

  it('para un rematador, renderiza la pantalla de canje de código de operador (ADR-048)', () => {
    useAuthMock.mockReturnValue({ user: { full_name: 'Dana', role: 'rematador' } });

    renderHomePage();

    expect(screen.getByText('Unirme como operador')).toBeInTheDocument();
    expect(screen.queryByText('Bienvenido, Dana')).not.toBeInTheDocument();
  });

  it('para un admin, muestra un link real al panel de administrador', () => {
    useAuthMock.mockReturnValue({ user: { full_name: 'Cami', role: 'admin' } });

    renderHomePage();

    expect(screen.getByText('Bienvenido, Cami')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ir al panel de administrador' })).toBeInTheDocument();
  });
});
