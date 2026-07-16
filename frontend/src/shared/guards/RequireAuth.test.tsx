import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { RequireAuth } from './RequireAuth';

const { useAuthMock } = vi.hoisted(() => ({ useAuthMock: vi.fn() }));
vi.mock('../../features/auth/hooks', () => ({ useAuth: useAuthMock }));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<RequireAuth />}>
          <Route path="/protegida" element={<p>Contenido protegido</p>} />
        </Route>
        <Route path="/login" element={<p>Pantalla de login</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('RequireAuth', () => {
  it('muestra un spinner mientras el store todavía no rehidrató', () => {
    useAuthMock.mockReturnValue({ isAuthenticated: false, isHydrated: false });

    renderAt('/protegida');

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByText('Contenido protegido')).not.toBeInTheDocument();
  });

  it('redirige a /login si ya rehidrató y no hay sesión', () => {
    useAuthMock.mockReturnValue({ isAuthenticated: false, isHydrated: true });

    renderAt('/protegida');

    expect(screen.getByText('Pantalla de login')).toBeInTheDocument();
  });

  it('renderiza la ruta protegida si hay sesión', () => {
    useAuthMock.mockReturnValue({ isAuthenticated: true, isHydrated: true });

    renderAt('/protegida');

    expect(screen.getByText('Contenido protegido')).toBeInTheDocument();
  });
});
