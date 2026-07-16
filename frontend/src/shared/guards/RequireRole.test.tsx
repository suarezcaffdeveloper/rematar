import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { RequireRole } from './RequireRole';

const { useAuthMock } = vi.hoisted(() => ({ useAuthMock: vi.fn() }));
vi.mock('../../features/auth/hooks', () => ({ useAuth: useAuthMock }));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<RequireRole allowedRoles={['admin']} />}>
          <Route path="/admin" element={<p>Panel de administración</p>} />
        </Route>
        <Route path="/403" element={<p>No autorizado</p>} />
        <Route path="/login" element={<p>Pantalla de login</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('RequireRole', () => {
  it('deja pasar a un usuario con el rol permitido', () => {
    useAuthMock.mockReturnValue({ user: { role: 'admin' } });

    renderAt('/admin');

    expect(screen.getByText('Panel de administración')).toBeInTheDocument();
  });

  it('redirige a /403 si el rol no está permitido', () => {
    useAuthMock.mockReturnValue({ user: { role: 'comprador' } });

    renderAt('/admin');

    expect(screen.getByText('No autorizado')).toBeInTheDocument();
  });

  it('redirige a /login si, por alguna razón, no hay usuario cargado', () => {
    useAuthMock.mockReturnValue({ user: null });

    renderAt('/admin');

    expect(screen.getByText('Pantalla de login')).toBeInTheDocument();
  });
});
