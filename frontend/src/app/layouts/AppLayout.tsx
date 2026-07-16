import { Link, Outlet } from 'react-router-dom';
import { useAuth, useAuthActions } from '../../features/auth/hooks';
import { Button } from '../../shared/components/Button';

/**
 * Layout para la aplicación autenticada -- header con identidad del usuario actual y
 * logout, `<Outlet />` para el contenido de cada pantalla. Vive DENTRO de
 * `RequireAuth` (ver `app/router.tsx`), así que `user` siempre existe acá.
 */
export function AppLayout() {
  const { user } = useAuth();
  const { logout } = useAuthActions();

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link to="/" className="text-lg font-bold text-brand-700">
            RematAR
          </Link>
          <div className="flex items-center gap-4">
            {user && (
              <span className="text-sm text-slate-600">
                {user.full_name} · <span className="text-slate-400">{user.role}</span>
              </span>
            )}
            <Button variant="secondary" onClick={logout}>
              Cerrar sesión
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
