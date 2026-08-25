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
          <Route path="/" element={<p>Dashboard autenticado</p>} />
          <Route path="/protegida" element={<p>Contenido protegido</p>} />
          <Route path="/remates" element={<p>Listado público de remates</p>} />
          <Route path="/remates/:remateId" element={<p>Detalle público del remate</p>} />
          <Route path="/remates/:remateId/sala" element={<p>Sala del remate</p>} />
          <Route path="/remates/:remateId/gestionar" element={<p>Consola operativa</p>} />
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

  it('redirige a /remates en "/" si no hay sesión, para mostrar el listado público de remates', () => {
    useAuthMock.mockReturnValue({ isAuthenticated: false, isHydrated: true });

    renderAt('/');

    expect(screen.getByText('Listado público de remates')).toBeInTheDocument();
    expect(screen.queryByText('Pantalla de login')).not.toBeInTheDocument();
  });

  it('sigue mostrando el dashboard autenticado en "/" si hay sesión (no la landing)', () => {
    useAuthMock.mockReturnValue({ isAuthenticated: true, isHydrated: true });

    renderAt('/');

    expect(screen.getByText('Dashboard autenticado')).toBeInTheDocument();
  });

  it('deja pasar el listado público de remates sin sesión ("ver como invitado", ADR-049)', () => {
    useAuthMock.mockReturnValue({ isAuthenticated: false, isHydrated: true });

    renderAt('/remates');

    expect(screen.getByText('Listado público de remates')).toBeInTheDocument();
    expect(screen.queryByText('Pantalla de login')).not.toBeInTheDocument();
  });

  it('deja pasar el detalle público de un remate sin sesión (ADR-049)', () => {
    useAuthMock.mockReturnValue({ isAuthenticated: false, isHydrated: true });

    renderAt('/remates/abc123');

    expect(screen.getByText('Detalle público del remate')).toBeInTheDocument();
    expect(screen.queryByText('Pantalla de login')).not.toBeInTheDocument();
  });

  it('deja pasar la sala en vivo de un remate sin sesión (WebSocket anónimo, ADR-049)', () => {
    useAuthMock.mockReturnValue({ isAuthenticated: false, isHydrated: true });

    renderAt('/remates/abc123/sala');

    expect(screen.getByText('Sala del remate')).toBeInTheDocument();
    expect(screen.queryByText('Pantalla de login')).not.toBeInTheDocument();
  });

  it('sigue exigiendo sesión para cualquier otra sub-ruta de gestión de un remate', () => {
    useAuthMock.mockReturnValue({ isAuthenticated: false, isHydrated: true });

    renderAt('/remates/abc123/gestionar');

    expect(screen.getByText('Pantalla de login')).toBeInTheDocument();
  });

  it('un logout explícito en "/" va a /login, no al listado público de remates (ADR-049 no aplica acá)', () => {
    useAuthMock.mockReturnValue({ isAuthenticated: false, isHydrated: true, justLoggedOut: true });

    renderAt('/');

    expect(screen.getByText('Pantalla de login')).toBeInTheDocument();
    expect(screen.queryByText('Listado público de remates')).not.toBeInTheDocument();
  });

  it('un logout explícito en una ruta públicamente visible también va a /login, no se queda como invitado', () => {
    useAuthMock.mockReturnValue({ isAuthenticated: false, isHydrated: true, justLoggedOut: true });

    renderAt('/remates/abc123/sala');

    expect(screen.getByText('Pantalla de login')).toBeInTheDocument();
  });
});
