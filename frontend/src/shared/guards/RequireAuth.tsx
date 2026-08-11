import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../features/auth/hooks';
import { Spinner } from '../components/Spinner';
import { LandingPage } from '../../features/landing/pages/LandingPage';

/**
 * Envuelve un grupo de rutas (`app/router.tsx`) que exigen sesión iniciada. Redirige a
 * `/login` guardando la ruta original en `location.state.from`, para que `LoginPage`
 * pueda volver ahí después de autenticar en vez de mandar siempre a la home.
 *
 * Espera a `isHydrated` antes de decidir: `useAuthStore` persiste en `localStorage` y
 * rehidrata de forma asíncrona (ver docstring de `features/auth/store.ts`) -- sin este
 * chequeo, refrescar la página en una ruta protegida redirigiría a `/login` por una
 * fracción de segundo aunque la sesión siga siendo válida.
 *
 * Caso especial para "/" (landing pública, ver `features/landing`): un visitante sin
 * sesión que llega a la raíz del sitio ve la landing en vez de ser mandado a
 * `/login` -- es la única excepción a "toda ruta bajo este guard exige sesión".
 * Cualquier otra ruta protegida sigue redirigiendo a `/login` exactamente igual que
 * antes, y un usuario autenticado sigue viendo su dashboard en "/" sin ningún cambio
 * (sigue siendo la ruta `index` de `AppLayout`) -- por eso todos los `navigate('/')`
 * ya existentes en la app (botones "volver al inicio") no se ven afectados.
 */
export function RequireAuth() {
  const { isAuthenticated, isHydrated } = useAuth();
  const location = useLocation();

  if (!isHydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!isAuthenticated) {
    if (location.pathname === '/') {
      return <LandingPage />;
    }
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
}
