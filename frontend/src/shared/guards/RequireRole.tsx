import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../features/auth/hooks';
import type { UserRole } from '../../features/auth/types';

export interface RequireRoleProps {
  allowedRoles: UserRole[];
}

/**
 * Se anida DENTRO de `RequireAuth` (`app/router.tsx`) -- nunca se usa solo, porque
 * asume que ya hay un `user` cargado. Si el rol del usuario actual no está en
 * `allowedRoles`, redirige a `/403` en vez de a `/login` (la sesión es válida, el
 * problema es de permisos, no de autenticación -- mismo criterio que el backend
 * distingue 401 de 403, ver `app/core/exceptions.py`).
 */
export function RequireRole({ allowedRoles }: RequireRoleProps) {
  const { user } = useAuth();

  if (!user) {
    // Defensivo: no debería pasar si RequireRole siempre cuelga de RequireAuth, pero
    // no hay nada seguro que renderizar sin un usuario.
    return <Navigate to="/login" replace />;
  }

  if (!allowedRoles.includes(user.role)) {
    return <Navigate to="/403" replace />;
  }

  return <Outlet />;
}
